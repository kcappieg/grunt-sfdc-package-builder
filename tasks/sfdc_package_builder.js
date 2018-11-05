/*
 * grunt-sfdc-package-builder
 * https://github.com/CMF-Group-Inc/grunt-sfdc-package-builder
 *
 * Copyright (c) 2018 Kevin C. Gall, CM&F Group Inc.
 * Licensed under the MIT license.
 */

'use strict';

const noWildcardTypesLib = require('./lib/metadata-access.js').noWildcardTypes;
const xmlBuilder = require('xmlbuilder');

module.exports = function(grunt) {
  const util = require('./lib/utils')(grunt);

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('sfdc_package_builder', 'Package.xml builder for SFDC platform as grunt task', function() {
    const done = this.async();

    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      all: false,
      useWildcards: true,
      metaWsdlLoc: './data/metadata-wsdl.xml', //careful here! probably not correct b/c of relative paths
      partnerWsdlLoc: './data/partner-wsdl.xml', //careful here! probably not correct b/c of relative paths
      excludeManaged: false,
      clearCache: false,
      dest: 'package.xml',
      apiVersion: '44.0',
    });

    Object.assign(options, this.data);

    if (options.excludeManaged === false) options.excludeManaged = [];

    if (!options.login) {
      grunt.warn('Login credentials missing');
      return;
    }

    let creds;
    try {
      if (typeof options.login === 'string') {
        creds = grunt.file.readJSON(options.login);
      } else {
        creds = options.login;
      }
    } catch (err) {
      grunt.warn('Unable to read login');
      return;
    }

    //check that there's something for us to build
    if (!options.all && !options.included) {
      grunt.warn('No metadata requested - specify either "all" or specific metadata in "included"');
      return;
    }

    const partnerSoapOptions = {};
    if (!!creds.url) {
      partnerSoapOptions.endpoint = creds.url + '/services/Soap/u/' + options.apiVersion;
    }

    let metaClient;
    let partnerClient;

    const wildcardTypes = []; //types we will retrieve using wildcard
    const itemizedTypes = []; //types that we will retrieve as itemized entries
    const folderNameToType = new Map();
    let doneCode = 0;

    //get session data and metadata soap client
    Promise.all([
      util.getPartnerClient(creds, options.partnerWsdlLoc, partnerSoapOptions),
      util.getMetaClient(options.metaWsdlLoc)
    ])
    //get metadata describe
    .then((data) => {
      partnerClient = data[0];
      metaClient = data[1];

      return util.withValidSession(partnerClient, metaClient,
        (innerMetaClient) => util.describeMetadata(innerMetaClient, options.apiVersion));
    })
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
              && !options.excludeManaged.includes(meta.xmlName)
              && !options.excludeManaged.includes(meta.directoryName)) {
            wildcardTypes.push(meta);
          } else {
            typesToQuery.push(meta);
          }
        }
      }
      
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
      /****************************
        START HERE
        Need to nail down nested folders
        to query all items
      ****************************/

      let folderContentQueries = [];
      let currentQuery;
      let counter = 0;

      listResults.forEach((res) => {
        if (!res[0]) return; //if no elements for type, nothing to do here!

        res[0].result.forEach((item) => {
          // TODO: filter out managed package items here

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
            itemizedTypes.push(item);
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
    .then((data) => {
      //kept temporarily for reference. Below prints non-managed items
      /*data.forEach((el) => {
        if (!el[0] || !el[0].result) return;
        el[0].result.forEach((el1) => {
          if (!el1.namespacePrefix) console.log(el1);
        });
      });*/
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

  });
};

function includeMetadataType(options, metaDesc) {
  const all = !!options.all;
  const included = !!options.included && 
    (options.included.includes(meta.xmlName)
      || options.included.includes(meta.directoryName));
  const excluded = !!options.excluded && 
    (options.excluded.includes(meta.xmlName)
      || options.excluded.includes(meta.directoryName));

  return (all && !excluded) || included;
}

class FolderData {
  constructor(metadataType, folderName) {
    this.metadataType = metadataType;
    this.folderName = folderName;
    this.fileLocations = [];
  }
}