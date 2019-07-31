# grunt-sfdc-package-builder [![npm version](https://badge.fury.io/js/grunt-sfdc-package-builder.svg)](https://badge.fury.io/js/grunt-sfdc-package-builder)

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

The task takes an argument for the action that is being performed. In most cases, the task will simply build a package.xml file. However, the task has the ability to build only a package manifest for files that have changed since the last time files have been diff-ed. In order to use this diff-ing functionality, you must run the task with the `diff` action:

```shell
grunt sfdc_package_builder:my_config:diff
```

Then, to build a package.xml from only the files changed since running the diff action

```shell
grunt sfdc_package_builder:my_config
```

## The "sfdc_package_builder" task

### Overview
This task automates the building of the `package.xml` file required for many SFDC development tasks. Existing tools like https://github.com/benedwards44/packagebuilder do a good job of building packages, but packagebuilder specifically requires the user to either hook into the existing Heroku-hosted app or to spin up a local server, and additionally does not allow granular package building.

This task will run entirely locally and allows fine-grained control over the resulting package that can be used in a variety of situations including full metadata pulls and deploy manifests.

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
Default value: `false`

A flag that indicates whether or not the wildcard character `*` should be used where available.

Note that metadata retrieved with wildcards will exclude Managed Package components.

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

#### options.includeSpecial
Type: `Array<String>`

This list is for metadata types that are not typically included without a parent metadata type. For instance, `CustomField` is a child of `CustomObject`, but can be queried separately. A common use case would be to retrieve all Custom Fields added to a Managed Object without necessarily querying the Managed Object.

The entries in the list are the values of the `<name>` XML elements, but not a folder name.

Alternatively, entries in the list can be the XML name of a parent metadata type for which you want to query all children. (i.e. `CustomObject`)

#### options.excludeManaged
Type: `boolean | MetaList`
Default: `false`

If `true`, managed package data will be excluded for all chosen metadata types. If a `MetaList`, each list entry will be excluded, but all others will include managed package metadata. Entries that are not "included" via the `all` or `included` options are ignored.

Note that any types explicitly specified by excludeManaged will not use wildcards

#### options.clearCache
Type: `boolean`
Default: `false`

If `true`, clears the cache of metadata info after performing all operations. Cached items include session and metadata describe information but *not* the results of queries since this is volatile information.

**Note** You can manually clear the metadata cache before executing this task by deleting the file located at `%PROJECT_ROOT%/.grunt/sfdc-package-builder/metadata-describe.cache`

#### options.dest
Type: `String`
Default: `"./package.xml"`

The destination for the package.xml file

#### options.apiVersion
Type: `String`
Default: `46.0`

The Metadata API version to use. Defaults to latest as of package release

#### options.login
Type: `Object | String`

If object, has these properties:
 - username
 - password
 - url - Only the host, not the path (i.e. `"https://test.salesforce.com"`)
 - token - The security token for the user

If string, this is the relative filepath for a json file of the above described schema

#### options.diffDirectory
Type: `String`

If specified, the directory indicated by this option is used to build a package.xml using only files that have changed since the last time the `diff` arugment was passed to the task. Note that if all metadata types are included, this task may take awhile as it hashes **all files included** and compares agains the previous hash. Recommended use is to limit the diff-ing to only the metadata types you expect to update regularly.

If a file has not been hashed by this task or if the task's cache is cleared, all files will be marked as changed and added to the `package.xml`

When this option is specified, the `includeSpecial` option is ignored

### Usage Examples

#### Examples
##### Basic
In this example, the task-global option is to use wildcards where applicable, and the specific task `basic` will create a package.xml file that includes all possible metadata units and put it at `%PROJECT_ROOT$/basic_package.xml`, excluding any managed metadata

```js
grunt.initConfig({
  sfdc_package_builder: {
    options: {
      useWildcards: true,
      login: 'credentials/my-sandbox-credentials.json'
    },
    basic: {
      all: true,
      dest: './basic_package.xml',
      excludeManaged: true
    }
  },
});
```

##### Full org with Managed
This example will build a package to query the full org with managed metadata, so basically a full org dump.

```js
grunt.initConfig({
  sfdc_package_builder: {
    full_org: {
      all: true,
      useWildcards: false,
      dest: './full_org_package.xml',
      excludeManaged: false
    }
  },
});
```

##### All unmanaged components
This example will build a package to query all unmanaged metadata including customizations to managed Custom Objects

```js
grunt.initConfig({
  sfdc_package_builder: {
    unmanaged: {
      all: true,
      useWildcards: true,
      dest: './unmanaged_package.xml',
      excludeManaged: true,
      includeSpecial: ['CustomObject']
    }
  },
});
```

##### Just Apex and Objects
This example will build a package to query all Apex and Custom Objects, but exclude managed Apex

```js
grunt.initConfig({
  sfdc_package_builder: {
    apex_objects: {
      useWildcards: false,
      dest: './apex_objects_package.xml',
      included: ['ApexClass', 'ApexTrigger', 'CustomObject'],
      excludeManaged: ['ApexClass','ApexTrigger']
    }
  },
});
```

##### A Diff config
This example configuration can be used for both the diff action and building the diff-ed package. It will create hashes of all Apex and Aura files when run with the `diff` action. Then, when run with as a build, it will hash the current state of the files and only include items whose hashes do not match in the package.xml generated

```js
grunt.initConfig({
  sfdc_package_builder: {
    diffOpts: {
      useWildcards: false,
      dest: './diff_package.xml',
      included: ['ApexClass', 'ApexTrigger', 'AuraDefinitionBundle'],
      excludeManaged: true,
      diffDirectory: './codebase/src'
    }
  },
});
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Disclaimer
This release has no unit test coverage. Use at your own risk.

## Release History
11/8/2018 - 0.0.1-beta.1