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
/* globals d3 */

var bgColors = [
  'red', 'blue', 'green', 'yellow',
];

function fetchJson(endpoint) {
  return fetch('/api/' + endpoint, {credentials: 'same-origin'})
      .then(resp => resp.json());
}

/* exported BigBoard */
class BigBoard {
  constructor() {
    this.layout = null;
    this.clients = null;
    this.now = Infinity;
  }

  update() {
    var layoutReq = fetchJson('layout')
        .then(layout => this.layout = layout, err => {
          if (this.layout) {
            this.layout.partitions = [];
          }
        });
    var clientsReq = fetchJson('clients')
        .then(clients => this.clients = clients, err => {
          this.clients = [];
        });
    Promise.all([layoutReq, clientsReq]).then(() => this.render());

    fetchJson('errors').then(errors => this.showErrors(errors));
  }

  renderError(e) {
    var date = new Date(e.timestamp).toLocaleString();
    return `${date} ${e.origin} ${e.namespace} ${e.message}`;
  }

  showErrors(errors) {
    var items = d3.select('#errors')
        .selectAll('.line')
        .data(errors, error => error.timestamp);
    items.enter().append('div')
      .attr('class', 'line')
      .attr('title', error => error.stack)
      .text(this.renderError)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .order();
    items.exit().remove();
  }

  setNow(n) {
    this.now = n;
  }

  render() {
    var wall = this.layout.wall;
    var width, height, maxSize;
    if (wall.extents.w > wall.extents.h) {
      width = window.innerWidth - 40;
      height = width * wall.extents.h / wall.extents.w;
      maxSize = width;
    } else {
      height = window.innerHeight - 40;
      width = height * wall.extents.w / wall.extents.h;
      maxSize = height;
    }

    var chart = d3.select('svg');
    chart.attr('width', width);
    chart.attr('height', height);

    var scale = d3.scale.linear()
        .domain([0, Math.max(wall.extents.w, wall.extents.h)])
        .range([0, maxSize]);
    var lineFromPoints = d3.svg.line()
        .x((pt) => scale(pt.x))
        .y((pt) => scale(pt.y));

    var clientKey = (d) => [d.rect.x, d.rect.y].join(',');
    var clients = chart.select('#clients').selectAll('.client')
        .data(this.clients, clientKey);
    var g = clients.enter().append('g').attr('class', 'client');
    g.append('rect')
        .attr('stroke', '#ccc')
        .attr('fill', 'none')
        .attr('x', (d) => scale(d.rect.x))
        .attr('y', (d) => scale(d.rect.y))
        .attr('width', (d) => scale(d.rect.w))
        .attr('height', (d) => scale(d.rect.h));
    g.append('text')
        .attr('x', (d) => scale(d.rect.x) + 5)
        .attr('y', (d) => scale(d.rect.y) + 20);
    clients.select('text')
        .text((d) => d.module);
    clients.exit().remove();

    // TODO(jacobly): not sure this is the right way to bind a single value.
    var wallGeo = chart.selectAll('.wall').data([wall]);
    wallGeo.enter().append('path')
        .attr('class', 'wall')
        .attr('stroke', 'black')
        .attr('stroke-width', '2')
        .attr('fill', 'none');
    wallGeo
        .attr('d', lineFromPoints(wall.points));

    var partitions = chart.select('#outline').selectAll('.partition')
        .data(this.layout.partitions);
    var partitionGroups = partitions.enter().append('g')
        .attr('class', 'partition');
    partitionGroups.append('path')
        .attr('fill-opacity', 0.1);
    partitionGroups.append('text')
        .attr('stroke', 'gray')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle');
    partitions.select('path')
        .attr('d', (d) => lineFromPoints(d.geo.points))
        .attr('fill', (d, i) => bgColors[i % bgColors.length]);
    partitions.select('text')
        .text((d) => {
          var r = d.state;
          if (d.deadline !== null && d.deadline !== Infinity) {
            r += ': ' + (d.deadline - this.now).toFixed(2);
          }
          return r;
        })
        .attr('x', (d, index) => {
          var bbox = partitions.select('path')[0][index].getBBox();
          return bbox.x + bbox.width / 2;
        })
        .attr('y', (d, index) => {
          var bbox = partitions.select('path')[0][index].getBBox();
          return bbox.y + bbox.height / 2;
        });
    partitions.exit().remove();
  }
}

var board = new BigBoard();
board.update();
setInterval(() => board.update(), 5000);

requirejs(['/config.js'], function(require) {
  requirejs(['client/network/network',
             'client/util/time'], function(network, time) {
    network.openConnection();
    time.start();
    setInterval(function() {
      if (board) {
        board.setNow(time.now());
      }
    }, 100);
  });
});

fetchJson('config').then(config => {
  document.forms[0].config.value = JSON.stringify(
      config.current, null, '  ');
});
