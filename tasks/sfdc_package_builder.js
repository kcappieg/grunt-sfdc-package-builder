/*
 * grunt-sfdc-package-builder
 * https://github.com/CMF-Group-Inc/grunt-sfdc-package-builder
 *
 * Copyright (c) 2018 Kevin C. Gall, CM&F Group Inc.
 * Licensed under the MIT license.
 */

'use strict';

const soap = require('soap');
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
    let sessionHeaderIndex = -1;
    let doneCode = 0;

    //get session data and metadata soap client
    Promise.all([
      util.getSession(creds, options.partnerWsdlLoc, partnerSoapOptions),
      soap.createClientAsync(options.metaWsdlLoc)
    ])
    //get metadata describe
    .then((data) => {
      const {sessionId, metaUrl} = data[0];
      metaClient = data[1];

      metaClient.addSoapHeader(util.callOptionsHeader, '', 'tns');
      sessionHeaderIndex = metaClient.addSoapHeader({SessionHeader: {sessionId}}, '', 'tns');
      metaClient.setEndpoint(metaUrl);

      return util.describeMetadata(metaClient, options.apiVersion);
    })
    //Handle session id errors
    .catch((err) => {
      //Error could be invalid (expired) session, so handle that
      if (util.isInvalidSession(err)) {
        return util.login(creds, options.partnerWsdlLoc, partnerSoapOptions)
          .then((sessionInfo) => {
            const {sessionId, metaUrl} = sessionInfo;

            if (sessionHeaderIndex >= 0) {
              metaClient.changeSoapHeader(sessionHeaderIndex, {SessionHeader: {sessionId}}, '', 'tns');
            } else {
              sessionHeaderIndex = metaClient.addSoapHeader({SessionHeader: {sessionId}}, '', 'tns');
            }
            metaClient.setEndpoint(metaUrl);

            return util.describeMetadata(metaClient, options.apiVersion);
          });
      } else {
        throw err; //rethrow
      }
    })
    // identify metadata to grab based on user options
    // then send listMetadata query
    .then((metaDescribe) => {
      let wildcardTypes = []; //types we will retrieve using wildcard
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

      // console.log(metaDescribe);
      
      const listQuerySets = [];
      let counter = 0;
      let querySet;
      typesToQuery.forEach((meta) => {
        if (counter % 3 == 0) {
          querySet = [];
          listQuerySets.push(querySet);
        }

        const folderSuffix = (meta.inFolder && meta.xmlName !== 'EmailTemplate') ?
          'Folder' : '';

        querySet.push({type: meta.xmlName + folderSuffix});
        counter++;
      });

      const listQueryRequests = listQuerySets.map((queryList) => {
        return metaClient.listMetadataAsync({
          queries: queryList,
          asOfVersion: options.apiVersion
        });
      });

      //first element of returned promise data array is the wildcard types
      return Promise.all([wildcardTypes].concat(listQueryRequests));
    })
    //handle list results: build package.xml
    .then((listResults) => {
      let wildcardTypes = listResults.shift();



      listResults.forEach((res) => {
        if (!res[0]) return; //if no elements for type, nothing to do here!

        console.log(res);
        console.log(res[0].result);
      });
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