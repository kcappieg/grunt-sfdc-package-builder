/**
 *  Utility functions for task
 */

"use strict";

const TASK_DIR = '.grunt/sfdc_package_builder/';
const CACHE_DIR = TASK_DIR + 'cache/';
const META_CACHE = CACHE_DIR + 'metadata-describe.cache';
const SESSION_CACHE = CACHE_DIR + 'session';
const INVALID_SESSION_CODE = 'sf:INVALID_SESSION_ID';

const soap = require('soap');
const md5 = require('md5');
const os = require('os');

module.exports = function(grunt) {
  return {
    TASK_DIR,
    CACHE_DIR,

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

    getPartnerClient: function(creds, wsdlLoc, options) {
      return soap.createClientAsync(wsdlLoc, options)
        .then((partnerClient) => {
          //store references to objects I'll need later
          partnerClient.$$creds = creds;
          partnerClient.$$options = options;
          partnerClient.addSoapHeader(this.callOptionsHeader, '', 'tns');

          return partnerClient;
        });
    },

    getMetaClient: function(wsdlLoc) {
      return soap.createClientAsync(wsdlLoc)
        .then((metaClient) => {
          metaClient.$$sessionHeaderIndex = -1;
          metaClient.addSoapHeader(this.callOptionsHeader, '', 'tns');

          return metaClient;
        });
    },

    /**
     *  Invokes lambda with metaClient as its only argument.
     *  Note that if there is an invalid session error from a cached session,
     *  lambda will be invoked again after a successful login
     */
    withValidSession: function(partnerClient, metaClient, lambda) {
      return this.getSession(partnerClient)
        .then((sessionData) => {
          this.setSessionData(sessionData, metaClient);
          return lambda(metaClient);
        })
        .catch((err) => {
          if (this.isInvalidSession(err)) {
            this.logErr(err);

            //login, then invoke lambda
            return this.login(partnerClient)
              .then((sessionData) => {
                this.setSessionData(sessionData, metaClient);
                return lambda(metaClient);
              });

          } else {
            throw err; //rethrow if not session error
          }
        });
    },

    /**
     *  @return Promise. Data is object: sessionId, metaUrl
     */
    getSession: function getSession(partnerClient) {
      return new Promise((resolve, reject) => {
        let sessionCacheInfo = grunt.file.readJSON(SESSION_CACHE);

        const credsHash = this.hashCreds(partnerClient.$$creds);

        if (!sessionCacheInfo.session ||
          !sessionCacheInfo.session.sessionId ||
          !sessionCacheInfo.session.metaUrl ||
          sessionCacheInfo.credsHash !== credsHash ||
          sessionCacheInfo.options.endpoint !== partnerClient.$$options.endpoint) {

          reject('cache invalid');
        }

        resolve(sessionCacheInfo.session);
      })
      .catch((reject) => {
        this.logErr(reject);

        return this.login(partnerClient);
      });
    },

    /**
     *  @return Promise. Data is object: sessionId, metaUrl
     */
    login: function login(partnerClient) {
      return partnerClient.loginAsync({
        username: partnerClient.$$creds.username,
        password: partnerClient.$$creds.password + partnerClient.$$creds.token
      })
      .then((loginRes) => {
        this.logSoapResponse(loginRes,'Login response/request');

        const {sessionId, metadataServerUrl: metaUrl} = loginRes[0].result;
        const sessionInfo = {sessionId, metaUrl};

        //Cache session info
        //don't store credentials, just hash. Does not need crypto-security
        const credsHash = this.hashCreds(partnerClient.$$creds);
        const sessionCacheInfo = {
          session: sessionInfo,
          credsHash,
          options: partnerClient.$$options,
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

        if (!metaDescribe.apiVersion ||
            !metaDescribe.metadataObjects) {
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
    },

    setSessionData: function(sessionData, metaClient) {
      const {sessionId, metaUrl} = sessionData;

      if (metaClient.$$sessionHeaderIndex > -1) {
        metaClient.changeSoapHeader(metaClient.$$sessionHeaderIndex,
          {SessionHeader: {sessionId}}, '', 'tns');
      } else {
        metaClient.$$sessionHeaderIndex = metaClient.addSoapHeader(
          {SessionHeader: {sessionId}}, '', 'tns');
      }
      metaClient.setEndpoint(metaUrl);
    },

    includeMetadataType: function(options, metaDesc) {
      const all = !!options.all;
      const included = !!options.included && 
        (options.included.includes(metaDesc.xmlName) ||
          options.included.includes(metaDesc.directoryName));
      const excluded = !!options.excluded && 
        (options.excluded.includes(metaDesc.xmlName) ||
          options.excluded.includes(metaDesc.directoryName));

      return (all && !excluded) || included;
    },

    includeMetadataItem: function(options, item) {
      if (!!item.manageableState && item.manageableState !== 'unmanaged') {
        const excludeManaged = options.excludeManaged === true;
        const specificallyExcluded =
          Array.isArray(options.excludeManaged) && options.excludeManaged.includes(item.type);
        const specificallyIncluded =
          Array.isArray(options.includeManaged) && options.includeManaged.includes(item.type);

        if ((excludeManaged && !specificallyIncluded) || specificallyExcluded) {
          return false;
        }
      }

      return true;
    },
  };
};
