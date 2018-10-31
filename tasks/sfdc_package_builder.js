/*
 * grunt-sfdc-package-builder
 * https://github.com/CMF-Group-Inc/grunt-sfdc-package-builder
 *
 * Copyright (c) 2018 Kevin C. Gall, CM&F Group Inc.
 * Licensed under the MIT license.
 */

'use strict';

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

    //check that there's something for us to build
    if (!options.all && !options.included) {
      grunt.warn('No metadata requested - specify either "all" or specific metadata in "included"');
      return;
    }

    const partnerSoapOptions = {};
    if (!!options.login.url) {
      partnerSoapOptions.endpoint = options.login.url + '/services/Soap/u/' + options.apiVersion;
    }

    soap.createClientAsync(options.partnerWsdlLoc, partnerSoapOptions)
    .then((partnerClient) => {
      // console.log(partnerClient);
      return partnerClient.loginAsync({
        username: options.login.username,
        password: options.login.password + options.login.token
      });
    }).then((loginRes) => {
      console.log(loginRes);
      
      done();
    }).catch((err) => {
      console.log(err);
      grunt.warn('Error');

      done(-1);
    })

  });

};
