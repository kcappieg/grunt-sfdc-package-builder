/*
 * grunt-sfdc-package-builder
 * https://github.com/CMF-Group-Inc/grunt-sfdc-package-builder
 *
 * Copyright (c) 2018 Kevin C. Gall
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.tests %>'
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    // Before generating any new files, remove any previously-created files.
    clean: {
      tests: ['tmp']
    },

    // Configuration to be run (and then tested).
    sfdc_package_builder: {
      options: {
        useWildcards: true,
        dest: 'tmp/package.xml',
        login: 'creds/intsandbox.json',
      },
      default: {
        all: true
      }
    },

    // Unit tests.
    nodeunit: {
      tests: ['test/*_test.js']
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['clean', 'sfdc_package_builder', 'nodeunit']);
  grunt.registerTask('dev', ['sfdc_package_builder']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);

};
