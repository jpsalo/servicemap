/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const URI = require('URI');
    return {
        cleanAddress(address) {
            const SEPARATOR = '-';
            let modified = false;

            const separatorsToConvert = /\++/g;
            const extraZipCode = /^[0-9]+[ -+]+/;
            const extraCitySuffix = / kaupunki/;

            modified = false;
            for (let key of ['municipality', 'street']) {
                if (address[key].search(separatorsToConvert) > -1) {
                    address[key] = address[key].replace(separatorsToConvert, SEPARATOR);
                    modified = true;
                }
            }
            if (address.municipality.search(extraZipCode) > -1) {
                address.municipality = address.municipality.replace(extraZipCode, '');
                modified = true;
            }
            if (address.municipality.search(extraCitySuffix) > -1) {
                address.municipality = address.municipality.replace(/espoon kaupunki/i, 'espoo');
                modified = true;
            }
            if (modified) {
                const uri = new URI;
                const segment = _.map(['municipality', 'street', 'numberPart'], key => address[key]);
                segment.unshift('address');
                uri.segmentCoded(segment);
                return [uri, address];
            }
            return [null, null];
        }
    };});
