/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let exports;
    const Backbone = require('backbone');

    const debugVariables = [
        'units',
        'services',
        'selectedUnits',
        'selectedEvents',
        'searchResults',
        'searchState'
    ];
    const debugEvents = [
        'all'
    ];
    const log = x => console.log(x);

    // Class whose name stands out in console output.
    class STATEFUL_EVENT {}

    class EventDebugger {
        constructor(appControl) {
            this.appControl = appControl;
            _.extend(this, Backbone.Events);
            this.addListeners();
        }

        addListeners() {
            const interceptor = variableName =>
                function(eventName, target, ...rest) {
                    const data = new STATEFUL_EVENT;
                    data.variable = variableName;
                    data.event = eventName;
                    data.target = __guardMethod__(target, 'toJSON', o => o.toJSON()) || target;
                    for (let i = 0; i < rest.length; i++) {
                        const param = rest[i];
                        data[`param_${i+1}`] = param;
                    }
                    return log(data);
                }
            ;
            return (() => {
                const result = [];
                for (var variableName of Array.from(debugVariables)) {
                    result.push(Array.from(debugEvents).map((eventSpec) =>
                        this.listenTo(this.appControl[variableName], eventSpec,
                            interceptor(variableName))));
                }
                return result;
            })();
        }
    }

    return exports = {
        EventDebugger,
        log
    };
});

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}