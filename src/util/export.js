/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let searchResults, selectedServices, selectedUnits, specs, units;
    const URI   = require('URI');

    const models = require('app/models');

    const modelsToSelectionType = appModels => {
        ({ selectedUnits, selectedServices, searchResults, units } = appModels);

        if (selectedUnits.isSet()) {
            return 'single';
        } else if (selectedServices.isSet()) {
            return 'service';
        } else if (searchResults.isSet()) {
            return 'search';
        } else if (units.isSet() && units.hasFilters()) {
            if (units.filters.bbox == null) {
                if (units.filters.division != null) {
                    return 'division';
                } else if (units.filters.distance != null) {
                    return 'distance';
                }
            }
        }
        return 'unknown';
    };

    const modelsToExportSpecification = appModels => {
        let divisions;
        ({ selectedUnits, selectedServices, searchResults, units, divisions } = appModels);
        const key = modelsToSelectionType(appModels);
        specs = {key, size: units.size()};
        return _.extend(specs, (() => { switch (key) {
            case 'single':
                var unit = selectedUnits.first();
                return {
                    url: unit.url(),
                    size: 1,
                    details: [unit.getText('name')]
                };
            case 'service':
                var unitList = new models.UnitList();
                unitList.setFilter('service', selectedServices.pluck('id').join(','));
                return {
                    url: unitList.url(),
                    details: selectedServices.map(s => s.getText('name'))
                };
            case 'search':
                return {
                    details: [searchResults.query],
                    url: searchResults.url()
                };
            case 'division':
                return {
                    details: divisions.map(d => d.getText('name')),
                    url: units.url()
                };
            case 'distance':
                return {
                    details: [],
                    url: units.url()
                };
            default:
                return {url: null};
        } })()
        );
    };

    const exportSpecification = (format, appModels) => {
        if (!['kml', 'json'].includes(format)) {
            return null;
        }
        specs = modelsToExportSpecification(appModels);
        const { url } = specs;
        if (url) {
            const uri = URI(url);
            uri.addSearch({format});
            specs.url = uri.toString();
        }
        return specs;
    };

    return {exportSpecification};
});
