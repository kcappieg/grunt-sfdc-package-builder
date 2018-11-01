# grunt-sfdc-package-builder

> Package.xml builder for SFDC platform as grunt task

## Getting Started
This plugin requires Grunt `~1.0.0`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-sfdc-package-builder --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-sfdc-package-builder');
```

## The "sfdc_package_builder" task

### Overview
This task automates the building of the `package.xml` file required for many SFDC development tasks. Existing tools like https://github.com/benedwards44/packagebuilder do a good job of building packages, but packagebuilder specifically requires the user to either hook into the existing Heroku-hosted app or to spin up a local server, and additionally does not allow granular package building.

This task will run entirely locally and allows fine-grained control over the resulting package that can be used in a variety of situations including full metadata pulls and deploy manifests.

#### Extensions
It is unclear if the initial launch will include this capability, but the intention is to include local file diffing for building very targeted packages meant for deploy

### Usage

In your project's Gruntfile, add a section named `sfdc_package_builder` to the data object passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  sfdc_package_builder: {
    options: {
      // Task-specific options go here.
    },
    your_target: {
      // Target-specific file lists and/or options go here.
    },
  },
});
```

### Options

Many of the below options accept a "Metadata Description List" as described below:

#### MetaList
Type: `Array<String>`

Array where each element is the value of the `<name>` Node corresponding to the metadata type **or** the directory name that will be delivered in the .zip file

#### options.all
Type: `boolean`
Default value: `false`

A flag that indicates that all metadata types should be included

#### options.useWildcards
Type: `boolean`
Default value: `true`

A flag that indicates whether or not the wildcard character `*` should be used where available.

#### options.metaWsdlLoc
Type: `String`

A relative filepath for the location of the SFDC Metadata API WSDL. This option is a failsafe, as the package is distributed with the current SFDC metadata WSDL

#### options.partnerWsdlLoc
Type: `String`

A relative filepath for the location of the SFDC Partner API WSDL. This option is a failsafe, as the package is distributed with the current SFDC partner WSDL

#### options.excluded
Type: `MetaList`

If `options.all === false`, this option will be ignored

#### options.included
Type: `MetaList`

If `options.all === true`, this option will be ignored

#### options.excludeManaged
Type: `boolean | MetaList`
Default: `false`

If `true`, managed package data will be excluded for all chosen metadata types. If a `MetaList`, each list entry will be excluded, but all others will include managed package metadata. Entries that are not "included" via the `all` or `included` options are ignored.

Note that any types explicitly specified by excludeManaged will not use wildcards

#### options.clearCache
Type: `boolean`
Default: `false`

If `true`, clears the cache of metadata info after performing all operations.

**Note** You can manually clear the metadata cache before executing this task by deleting the file located at `%PROJECT_ROOT%/.grunt/sfdc-package-builder/metadata-describe.cache`

#### options.dest
Type: `String`
Default: `"./package.xml"`

The destination for the package.xml file

#### options.apiVersion
Type: `String`
Default: `44.0`

The Metadata API version to use. Defaults to latest as of package release

#### options.login
Type: `Object | String`

If object, has these properties:
 - username
 - password
 - url - Only the host, not the path (i.e. `"https://test.salesforce.com"`)
 - token - The security token for the user

If string, this is the relative filepath for a json-formatted string of the above described schema

### Usage Examples

#### Example
In this example, the task-global option is to use wildcards where applicable, and the specific task `full_org` will create a package.xml file that includes all possible metadata units and put it at `%PROJECT_ROOT$/full_org_package.xml`

```js
grunt.initConfig({
  sfdc_package_builder: {
    options: {
      useWildcards: true
    },
    full_org: {
      all: true,
      dest: './full_org_package.xml',
    }
  },
});
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
TBD
