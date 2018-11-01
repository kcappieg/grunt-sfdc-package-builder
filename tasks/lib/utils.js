/**
 *  Utility functions for task
 */

"use strict";

const CACHE_DIR = '.grunt/sfdc_package_builder/';
const META_CACHE = CACHE_DIR + 'metadata-describe.cache';
const SESSION_CACHE = CACHE_DIR + 'session';
const INVALID_SESSION_CODE = 'sf:INVALID_SESSION_ID';

const soap = require('soap');
const md5 = require('md5');
const os = require('os');

module.exports = function(grunt) {
  return {
    callOptionsHeader: {
      CallOptions: {client: 'Grunt Package.xml Builder'},
    },

    /**
     *  simple hash function that uses system mac addresses as salt. Defends
     *  against accidentally committing .grunt directory w/ exposed credential hashes
     */
    hashCreds: function hashCreds(creds) {
      let credString = JSON.stringify(creds);
      const networkIntf = os.networkInterfaces();

      //depends on consistent ordering of object props. Consequences for
      //inconsistency are low: we just re-login.
      for (let dev in networkIntf) {
        for (let intf of networkIntf[dev]) {
          credString += intf.mac;
        }
      }

      return md5(credString);
    },

    /**
     *  simply discovers whether the cause of an error is Invalid Session
     *  based on expected SOAP fault codes
     */
    isInvalidSession: function isInvalidSession(err) {
      try {
        return err.cause.root.Envelope.Body.Fault.faultcode === INVALID_SESSION_CODE;
      } catch (err) { //catch null reference exception
        return false;
      }
    },

    logSoapResponse: function logSoapResponse(res, message='SOAP Call request/response') {
      grunt.log.debug(message);
      grunt.log.debug(res[1]);
      grunt.log.debug(res[2]);
      grunt.log.debug(res[3]);
    },

    logErr: function logErr(err) {
      if (typeof err !== 'string') {
        err = err.message;
      }
      grunt.log.debug(err);
    },

    /**
     *  @return Promise. Data is object: sessionId, metaUrl
     */
    getSession: function getSession(creds, wsdlLoc, options) {
      return new Promise((resolve, reject) => {
        let sessionCacheInfo = grunt.file.readJSON(SESSION_CACHE);

        const credsHash = this.hashCreds(creds);

        if (!sessionCacheInfo.session
          || !sessionCacheInfo.session.sessionId
          || !sessionCacheInfo.session.metaUrl
          || sessionCacheInfo.credsHash !== credsHash
          || sessionCacheInfo.wsdlLoc !== wsdlLoc
          || sessionCacheInfo.options.endpoint !== options.endpoint) {

          reject('cache invalid');
        }

        resolve(sessionCacheInfo.session);
      })
      .catch((reject) => {
        this.logErr(reject);

        return this.login(creds, wsdlLoc, options);
      });
    },

    /**
     *  @return Promise. Data is object: sessionId, metaUrl
     */
    login: function login(creds, wsdlLoc, options) {
      return soap.createClientAsync(wsdlLoc, options)
        .then((partnerClient) => {
          partnerClient.addSoapHeader(this.callOptionsHeader, '', 'tns');

          return partnerClient.loginAsync({
            username: creds.username,
            password: creds.password + creds.token
          });

        }).then((loginRes) => {
          this.logSoapResponse(loginRes,'Login response/request');

          const {sessionId, metadataServerUrl: metaUrl} = loginRes[0].result;
          const sessionInfo = {sessionId, metaUrl};

          //Cache session info
          //don't store credentials, just hash. Does not need crypto-security
          const credsHash = this.hashCreds(creds);
          const sessionCacheInfo = {
            session: sessionInfo,
            credsHash,
            wsdlLoc,
            options,
            date: new Date().toGMTString(), //for debugging - time stamp
          };
          grunt.file.write(SESSION_CACHE, JSON.stringify(sessionCacheInfo));

          return sessionInfo;
        });
    },

    /**
     *  @return Promise whose data is an object with props:
     *    - apiVersion
     *    - organizationNamespace
     *    - metadataObjects
     */
    describeMetadata: function describeMetadata(metaClient, apiVersion) {
      return new Promise((resolve, reject) => {
        let metaDescribe = grunt.file.readJSON(META_CACHE);

        if (!metaDescribe.apiVersion
            || !metaDescribe.metadataObjects) {
          reject('Invalid metadata describe cache');
        }

        resolve(metaDescribe);
      })
      .catch((err) => {
        grunt.log.debug('metadata cache miss');
        this.logErr(err);

        return metaClient.describeMetadataAsync({apiVersion})
          .then((soapRes) => {
            this.logSoapResponse(soapRes, 'Describe Metadata soap response/request');

            const metadataCache = {
              apiVersion,
              organizationNamespace: soapRes[0].result.organizationNamespace,
              metadataObjects: soapRes[0].result.metadataObjects,
            };

            grunt.file.write(META_CACHE, JSON.stringify(metadataCache));

            return metadataCache;
          });
      });
    }
  };
}
