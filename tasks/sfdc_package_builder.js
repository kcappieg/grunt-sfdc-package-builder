/*
 * grunt-sfdc-package-builder
 * https://github.com/CMF-Group-Inc/grunt-sfdc-package-builder
 *
 * Copyright (c) 2018 Kevin C. Gall, CM&F Group Inc.
 * Licensed under the MIT license.
 */

'use strict';

const callOptionsHeader = {
  CallOptions: {client: 'Grunt Package.xml Builder'},
};
const cacheDir = '.grunt/sfdc_package_builder/';
const cacheLoc = cacheDir + 'metadata.cache';
const sessionCache = cacheDir + 'session';

const soap = require('soap');

module.exports = function(grunt) {

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
    let sessionHeaderIndex;

    Promise.all([
      getSession(creds, options.partnerWsdlLoc, partnerSoapOptions),
      soap.createClientAsync(options.metaWsdlLoc)
    ])
    .then((data) => {
      const {sessionId, metaUrl} = data[0];
      metaClient = data[1];

      metaClient.addSoapHeader(callOptionsHeader, '', 'tns');
      sessionHeaderIndex = metaClient.addSoapHeader({SessionHeader: {sessionId}}, '', 'tns');
      metaClient.setEndpoint(metaUrl);

      return metaClient.describeMetadataAsync({
        apiVersion: options.apiVersion
      });

    }).catch((err) => {
      return login(creds, options.partnerWsdlLoc, partnerSoapOptions)
        .then((sessionInfo) => {
          const {sessionId, metaUrl} = data[0];

          metaClient.changeSoapHeader(sessionHeaderIndex, {SessionHeader: {sessionId}}, '', 'tns');
          metaClient.setEndpoint(metaUrl);

          return metaClient.describeMetadataAsync({
            apiVersion: options.apiVersion
          });
        });
    }).then((soapRes) => {
      logSoapResponse(soapRes, 'Describe Metadata response/request');

      for (let meta of soapRes[0].result.metadataObjects) {
        console.log(meta);
      }
      
      done();
    }).catch((err) => {
      console.log(err);
      grunt.warn('Error');

      done(-1);
    });

  });

  function logSoapResponse(res, message='SOAP Call request/response') {
    grunt.log.debug(message);
    grunt.log.debug(res[1]);
    grunt.log.debug(res[2]);
    grunt.log.debug(res[3]);
  }

  /**
   *  @return Promise. Data is object: sessionId, metaUrl
   */
  function getSession(creds, wsdlLoc, options) {
    return new Promise((resolve, reject) => {
      let sessionCacheInfo = grunt.file.readJSON(sessionCache);

      const credsNoPass = {
        url: creds.url,
        username: creds.username
      };

      if (!sessionCacheInfo.session
        || !sessionCacheInfo.session.sessionId
        || !sessionCacheInfo.session.metaUrl
        || sessionCacheInfo.creds.url !== credsNoPass.url
        || sessionCacheInfo.creds.username !== credsNoPass.username
        || sessionCacheInfo.wsdlLoc !== wsdlLoc
        || sessionCacheInfo.options.endpoint, options.endpoint) {

        reject('cache invalid');
      }

      resolve(sessionCacheInfo.session);
    })
    .catch((reject) => {
      let err = reject;
      if (typeof err !== 'string') {
        err = err.message;
      }
      grunt.log.debug(err);

      return login(creds, wsdlLoc, options);
    });
  }

  /**
   *  @return Promise. Data is object: sessionId, metaUrl
   */
  function login(creds, wsdlLoc, options) {
    return soap.createClientAsync(wsdlLoc, options)
      .then((partnerClient) => {
        partnerClient.addSoapHeader(callOptionsHeader, '', 'tns');

        return partnerClient.loginAsync({
          username: creds.username,
          password: creds.password + creds.token
        });

      }).then((loginRes) => {
        logSoapResponse(loginRes,'Login response/request');

        const {sessionId, metadataServerUrl: metaUrl} = loginRes[0].result;
        const sessionInfo = {sessionId, metaUrl};

        //Cache session info
        const credsNoPass = {
          url: creds.url,
          username: creds.username
        };
        const sessionCacheInfo = {
          session: sessionInfo,
          creds: credsNoPass,
          wsdlLoc,
          options
        };
        grunt.file.write(sessionCache, JSON.stringify(sessionCacheInfo));

        return sessionInfo;
      });
  }
};