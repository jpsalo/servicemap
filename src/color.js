/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const Raven = require('raven');

    class ColorMatcher {
        static initClass() {
            this.serviceColors = {
                // Housing and environment
                1400: [77,139,0],
    
                // Administration and economy
                1401: [192,79,220],
    
                // Culture and leisure
                1403: [252,173,0],
    
                // Maps, information services and communication
                1402: [154,0,0],
    
                // Teaching and education
                1087: [0,81,142],
    
                // Family and social services
                783: [67,48,64],
    
                // Child daycare and pre-school education
                1405: [60,210,0],
    
                // Health care
                986: [142,139,255],
    
                // Public safety
                1061: [240,66,0]
            };
        }

            // The following are not root services
            // in the simplified service tree
            // Legal protection and democracy
            //26244: [192,79,220]
            // Planning, real estate and construction
            //25142: [40,40,40]
            // Tourism and events
            //25954: [252,172,0]
            // Entrepreneurship, work and taxation
            //26098: [192,79,220]
            // Sports and physical exercise
            //28128: [252,173,0]

        constructor(selectedServices) {
            this.selectedServices = selectedServices;
        }
        static rgb(r, g, b) {
            return `rgb(${r}, ${g}, ${b})`;
        }
        static rgba(r, g, b, a) {
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        }
        serviceColor(service) {
            return this.serviceRootIdColor(service.get('root'));
        }
        serviceRootIdColor(id) {
            const [r, g, b] = Array.from(this.constructor.serviceColors[id]);
            return this.constructor.rgb(r, g, b);
        }
        unitColor(unit) {
            let rootService;
            let roots = unit.get('root_ontologytreenodes');
            if (roots === null) {
                Raven.captureMessage(
                    `No roots found for unit ${unit.id}`,
                    {tags: {type: 'helfi_rest_api_v4'}});
                roots = [1400];
            }
            if (this.selectedServices != null) {
                rootService = _.find(roots, rid => {
                    return this.selectedServices.find(s => s.get('root') === rid);
                });
            }
            if (rootService == null) {
                rootService = roots[0];
            }
            const [r, g, b] = Array.from(this.constructor.serviceColors[rootService]);
            return this.constructor.rgb(r, g, b);
        }
    }
    ColorMatcher.initClass();

    return ColorMatcher;
});
