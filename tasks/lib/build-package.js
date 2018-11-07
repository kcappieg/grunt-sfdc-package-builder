/**
 *  Package Builder task function.
 *  Accepts the soap clients Promise and builds the package.json
 */

"use strict";

//3rd Party
const xmlBuilder = require('xmlbuilder');

//Utils
const noWildcardTypesLib = require('./metadata-access.js').noWildcardTypes;

module.exports = function(context) {
  const {grunt, util, partnerClient, metaClient, options, done} = context;

  const wildcardTypes = []; //types we will retrieve using wildcard
  const itemizedTypes = {}; //types that we will retrieve as itemized entries
  const folderNameToType = new Map();
  let doneCode = 0;

  //get metadata describe
  util.withValidSession(partnerClient, metaClient,
    (innerMetaClient) => util.describeMetadata(innerMetaClient, options.apiVersion))
    // identify metadata to grab based on user options
    // then send listMetadata query
    .then((metaDescribe) => {
      let typesToQuery = []; //types we will retrieve by itemizing members

      // Putting metadata types requested by config into 2 buckets:
      // wildcard queries and individual queries
      const noWildcardsForVersion = noWildcardTypesLib[options.apiVersion];
      for (let meta of metaDescribe.metadataObjects) {
        if (includeMetadataType(options, meta)) {
          if (options.useWildcards
              && !noWildcardsForVersion.includes(meta.xmlName)
              && (options.excludeManaged === true
                || options.excludeManaged.includes(meta.xmlName)
                || options.excludeManaged.includes(meta.directoryName))) {
            wildcardTypes.push(meta);
          } else {
            typesToQuery.push(meta);
          }
        }

        const typeIndex = options.includeSpecial.indexOf(meta.xmlName);
        if (typeIndex > -1) {
          //essentially expanding includeSpecial with child elements
          const children = meta.childXmlNames || [];
          options.includeSpecial.splice(typeIndex, children.length, ...children);
        }
      }

      options.includeSpecial.forEach((type) => {
        //push an object in the same shape as the describe results
        typesToQuery.push({
          inFolder: false,
          xmlName: type
        });
      });
      
      const listQuerySets = [];
      let counter = 0;
      let querySet;
      typesToQuery.forEach((meta) => {
        if (counter % 3 == 0) {
          querySet = [];
          listQuerySets.push(querySet);
        }

        let metaTypeName = meta.xmlName;
        let typeQuery = {};
        if (meta.inFolder) {
          if (meta.xmlName === 'EmailTemplate') {
            metaTypeName = 'EmailFolder';
          } else {
            metaTypeName += 'Folder';
          }

          folderNameToType.set(metaTypeName, meta.xmlName);
        }
        typeQuery.type = metaTypeName;

        querySet.push(typeQuery);
        itemizedTypes[meta.xmlName] = []; //init list
        counter++;
      });

      return util.withValidSession(partnerClient, metaClient, (innerMetaClient) => {
        const listQueryRequests = listQuerySets.map((queryList) => {
          return innerMetaClient.listMetadataAsync({
            queries: queryList,
            asOfVersion: options.apiVersion
          });
        });

        //first element of returned promise data array is the wildcard types
        return Promise.all(listQueryRequests);
      });
    })
    //handle list results: We need to recurse through folder metadata types
    //to retrieve folder contents as well
    .then((listResults) => {
      let folderContentQueries = [];
      let currentQuery;
      let counter = 0;

      listResults.forEach((res) => {
        if (!res[0]) return; //if no elements for type, nothing to do here!

        res[0].result.forEach((item) => {
          if (folderNameToType.has(item.type)) {
            if (counter % 3 === 0) {
              currentQuery = [];
              folderContentQueries.push(currentQuery);
            }
            currentQuery.push(
              {type: folderNameToType.get(item.type), folder: item.fullName}
            );

            counter++;
          } else {
            if (includeMetadataItem(options, item)) {
              itemizedTypes[item.type].push(item);
            }
          }
        });
      });

      const contentQueryRequests = folderContentQueries.map((current) => {
        return metaClient.listMetadataAsync({
          queries: current,
          asOfVersion: options.apiVersion
        });
      });

      return Promise.all(contentQueryRequests);
    })
    //We have all our itemized data. Build the package.xml
    .then((listResults) => {
      //first grab any content items from folders
      listResults.forEach((queryResult) => {
        if (!queryResult[0]) return; //no elements for folder, nothing to do!
        queryResult[0].result.forEach((contentItem) => {
          //filter managed items if applicable
          if (includeMetadataItem(options, contentItem)) {
            itemizedTypes[contentItem.type].push(contentItem);            
          }
        });
      });

      const pkg = xmlBuilder.create('Package', {encoding: 'UTF-8'})
        .att('xmlns', 'http://soap.sforce.com/2006/04/metadata');

      //Loop through itemized list items: log and add to package
      grunt.log.debug('Itemized Metadata:');
      for (let itemType in itemizedTypes) {
        const itemList = itemizedTypes[itemType];
        grunt.log.debug(`Type ${itemType}`);

        if (itemList.length === 0) continue;

        const typeElement = pkg.ele('types');
        itemList.forEach((item) => {
          grunt.log.debug(`  ${item.fullName}`);

          typeElement.ele('members').text(item.fullName);
        });

        typeElement.ele('name').text(itemType);
      }

      for (let wildcard of wildcardTypes) {
        pkg.ele({
          types: {
            members: '*',
            name: wildcard.xmlName
          }
        });
      }

      pkg.ele('version').text(options.apiVersion);

      //write package.xml
      grunt.file.write(options.dest, pkg.end({
        pretty: true,
        indent: '  ',
        newline: '\n',
      }));
    })
    //Log error and exit
    .catch((err) => {
      util.logErr(err);
      grunt.warn('Error');

      doneCode = 6;
    })
    .finally(() => {
      if (options.clearCache) {
        grunt.file.delete('.grunt/sfdc_package_builder');
      }

      done(doneCode);
    });
}

function includeMetadataType(options, metaDesc) {
  const all = !!options.all;
  const included = !!options.included && 
    (options.included.includes(metaDesc.xmlName)
      || options.included.includes(metaDesc.directoryName));
  const excluded = !!options.excluded && 
    (options.excluded.includes(metaDesc.xmlName)
      || options.excluded.includes(metaDesc.directoryName));

  return (all && !excluded) || included;
}

function includeMetadataItem(options, item) {
  if (item.manageableState !== 'unmanaged') {
    if (options.excludeManaged === true ||
        (Array.isArray(options.excludeManaged) && options.excludeManaged.includes(item.type))) {
      return false;
    }
  }

  return true;
}