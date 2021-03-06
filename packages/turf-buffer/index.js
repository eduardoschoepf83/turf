var d3 = require('d3-geo');
var jsts = require('jsts');
var meta = require('@turf/meta');
var circle = require('@turf/circle');
var center = require('@turf/center');
var helpers = require('@turf/helpers');
var feature = helpers.feature;
var geomEach = meta.geomEach;
var featureEach = meta.featureEach;
var featureCollection = helpers.featureCollection;
var radiansToDistance = helpers.radiansToDistance;
var distanceToRadians = helpers.distanceToRadians;

/**
 * Calculates a buffer for input features for a given radius. Units supported are miles, kilometers, and degrees.
 *
 * @name buffer
 * @param {FeatureCollection|Feature<any>} feature input to be buffered
 * @param {number} radius distance to draw the buffer
 * @param {string} [units=kilometers] any of the options supported by turf units
 * @param {number} [steps=64] number of steps
 * @return {FeatureCollection|Feature<Polygon|MultiPolygon>} buffered features
 * @example
 * var point = {
 *   "type": "Feature",
 *   "properties": {},
 *   "geometry": {
 *     "type": "Point",
 *     "coordinates": [-90.548630, 14.616599]
 *   }
 * };
 * var buffered = turf.buffer(point, 500, 'miles');
 *
 * //addToMap
 * var addToMap = [point, buffered]
 */

module.exports = function (geojson, radius, units, steps) {
    // validation
    if (!geojson) throw new Error('geojson is required');
    if (!radius) throw new Error('radius is required');
    if (radius <= 0) throw new Error('radius must be greater than 0');
    if (steps <= 0) throw new Error('steps must be greater than 0');

    // prevent input mutation
    // geojson = JSON.parse(JSON.stringify(geojson));

    // default params
    steps = steps || 64;
    units = units || 'kilometers';

    var results = [];
    switch (geojson.type) {
    case 'GeometryCollection':
        geomEach(geojson, function (geometry) {
            results.push(buffer(geometry, radius, units, steps));
        });
        return featureCollection(results);
    case 'FeatureCollection':
        featureEach(geojson, function (feature) {
            results.push(buffer(feature, radius, units, steps));
        });
        return featureCollection(results);
    }
    return buffer(geojson, radius, units, steps);
};

/**
 * Buffer single Feature/Geometry
 *
 * @private
 * @param {Feature<any>} geojson input to be buffered
 * @param {number} radius distance to draw the buffer
 * @param {string} [units='kilometers'] any of the options supported by turf units
 * @param {number} [steps=64] number of steps
 * @returns {Feature<Polygon|MultiPolygon>} buffered feature
 */
function buffer(geojson, radius, units, steps) {
    var properties = geojson.properties || {};
    var geometry = (geojson.type === 'Feature') ? geojson.geometry : geojson;

    // Geometry Types faster than jsts
    switch (geometry.type) {
    case 'Point':
        return circle(geometry.coordinates, radius, steps, units, properties);
    }

    // Project GeoJSON to Transverse Mercator projection (convert to Meters)
    var distance = radiansToDistance(distanceToRadians(radius, units), 'meters');
    var projection = defineProjection(geojson);
    var projected = {
        type: geometry.type,
        coordinates: projectCoords(geometry.coordinates, projection)
    };

    // JSTS buffer operation
    var reader = new jsts.io.GeoJSONReader();
    var geom = reader.read(projected);
    var buffered = geom.buffer(distance);
    var writer = new jsts.io.GeoJSONWriter();
    buffered = writer.write(buffered);

    // Unproject coordinates (convert to Degrees)
    buffered.coordinates = unprojectCoords(buffered.coordinates, projection);
    return feature(buffered, properties);
}


/**
 * Project coordinates to projection
 *
 * @private
 * @param {Array<any>} coords to project
 * @param {GeoProjection} projection D3 Geo Projection
 * @returns {Array<any>} projected coordinates
 */
function projectCoords(coords, projection) {
    if (typeof coords[0] !== 'object') return projection(coords);
    return coords.map(function (coord) {
        return projectCoords(coord, projection);
    });
}

/**
 * Un-Project coordinates to projection
 *
 * @private
 * @param {Array<any>} coords to un-project
 * @param {GeoProjection} projection D3 Geo Projection
 * @returns {Array<any>} un-projected coordinates
 */
function unprojectCoords(coords, projection) {
    if (typeof coords[0] !== 'object') return projection.invert(coords);
    return coords.map(function (coord) {
        return unprojectCoords(coord, projection);
    });
}

/**
 * Define Transverse Mercator projection
 *
 * @private
 * @param {Geometry|Feature<any>} geojson Base projection on center of GeoJSON
 * @returns {GeoProjection} D3 Geo Transverse Mercator Projection
 */
function defineProjection(geojson) {
    var coords = center(geojson).geometry.coordinates.reverse();
    var rotate = coords.map(function (coord) { return -coord; });
    var projection = d3.geoTransverseMercator()
        .center(coords)
        .rotate(rotate)
        .scale(6373000);

    return projection;
}
