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
    //identify metadata to grab based on user options
    .then((metaDescribe) => {
      let wildcardTypes = []; //types we will retrieve using wildcard
      let typesToQuery = []; //types we will retrieve by itemizing members

      const noWildcardsForVersion = noWildcardTypesLib[options.apiVersion];
      for (let meta of metaDescribe.metadataObjects) {
        if (includeMetadataType(meta)) {
          /************
            START HERE
          ************/
          if (options.useWildcards) {}
        }
      }
      
      done();
    })
    //Log error and exit
    .catch((err) => {
      util.logErr(err);
      grunt.warn('Error');

      done(6);
    });

  });
};

function includeMetadataType(options, metaDesc) {
  const all = !!options.all;
  const included = options.included.includes(meta.xmlName)
    || options.included.includes(meta.directoryName);
  const excluded = options.excluded.includes(meta.xmlName)
    || options.excluded.includes(meta.directoryName);

  return (all && !excluded) || included;
}