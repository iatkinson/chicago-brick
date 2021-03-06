/* Copyright 2015 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

'use strict';

var RJSON = require('relaxed-json');
var assert = require('assert');
var _ = require('underscore');
var debug = require('debug')('wall:playlist_loader');
var fs = require('fs');

var Layout = require('server/modules/layout');
var ModuleDef = require('server/modules/module_def');
var library = require('server/modules/module_library');

class PlaylistLoader {

  constructor(flags) {
    this.flags = flags;
  }

  /** Returns the list of ModuleDefs for a layout specification. */
  getModulesForLayout_(layout, collections) {
    if (this.flags.module) {
      // Copy the module name list.
      let names = this.flags.module.slice(0);
      if (names.length == 1) {
        // If we have one module, repeat it so transitions happen.
        names = [names[0], names[0]];
      }
      return names.map((n) => {
        assert(n in library.modules, 'Loaded playlist referenced module ' +
            n + ' which can\'t be found!');
        return library.modules[n];
      });
    }
    if (layout.collection) {
      // Special collection name to run all available modules.
      if (layout.collection == '__ALL__') {
        return _.values(library.modules);
      }
      assert(
          layout.collection in collections,
          'Unknown collection name: ' + layout.collection);
      
      return collections[layout.collection].map((n) => {
        assert(n in library.modules, 'Loaded playlist\'s collection ' +
          layout.collection + ' references module ' + n +
          ' which can\'t be found!');
        return library.modules[n];
      });
    }
    assert('modules' in layout, 'Missing modules list in layout def!');
    return layout.modules.map((n) => {
      assert(n in library.modules, 'Loaded playlist\'s layout mentions ' + 
        'module ' + n + ' which can\'t be found!');
      return library.modules[n];
    });
  }

  /** Creates a playlist JSON object from command-line flags. */
  getInitialPlaylistConfig() {
    var playlistConfig = fs.readFileSync(this.flags.playlist, 'utf8');
    return this.parseJson(playlistConfig);
  }

  // TODO(applmak): This is weird API, because it doesn't have any side effects
  // on 'this'.
  parseJson(jsonString) {
    return RJSON.parse(jsonString);
  }

  /** Parses a playlist JSON object into a list of Layouts. */
  parsePlaylist(config) {
    library.reset();
    var extraModules = config.modules || [];
    for (var m of extraModules) {
      assert(m.name && (m.extends || m.path), 'Invalid configuration: ' + m);
      if (m.extends) {
        assert(m.extends in library.modules, 'Module ' + m.name + 
          ' attempting to extend ' + m.extends + ' which was not found!');
        debug('Adding module ' + m.name + ' extending ' + m.extends);
        library.register(library.modules[m.extends].extend(
          m.name, m.title, m.author, m.config));
      } else {
        debug('Adding module ' + m.name + ' from ' + m.path);
        library.register(new ModuleDef(m.name, m.path, m.title, m.author, m.config));
      }
    }

    return config.playlist.map((layout) => {
      return new Layout({
        modules: this.getModulesForLayout_(layout, config.collections),
        moduleDuration: this.flags.module_duration || layout.moduleDuration,
        duration: this.flags.layout_duration || layout.duration,
        maxPartitions: this.flags.max_partitions || layout.maxPartitions,
      });
    });
  }

  /** Returns a layout list from command-line flags. */
  getInitialPlaylist() {
    return this.parsePlaylist(this.getInitialPlaylistConfig());
  }
}

module.exports = PlaylistLoader;
