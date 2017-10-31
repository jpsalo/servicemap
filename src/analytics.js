/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function() {

    const extractCommandDetails = function(command, parameters) {
        let name = undefined;
        const value = undefined;
        switch (command) {
            case 'addService':
                var serviceModel = parameters[0];
                if (serviceModel != null) {
                    const serviceName = __guard__(serviceModel.get('name'), x => x.fi);
                    if (serviceName != null) { name = serviceName + " "; }
                    name += `${serviceModel.get('id')}`;
                }
                break;
        }
        return {
            name,
            value
        };
    };

    return {
        trackCommand(command, parameters) {
            if (typeof _paq !== 'undefined' && _paq !== null) {
                const {name, value} = extractCommandDetails(command, parameters);
                return _paq.push(['trackEvent', 'Command', command, name, value]);
            }
        }
    };});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}