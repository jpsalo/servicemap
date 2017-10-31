/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _        = require('underscore');
    const Backbone = require('backbone');
    const Raven    = require('raven');

    if (appSettings.is_embedded) {
        return null;
    }

    class Accessibility {
        constructor() {
            this._requestData = this._requestData.bind(this);
            _.extend(this, Backbone.Events);
            //setTimeout @_requestData, 3000
            this._requestData();
        }

        _requestData() {
            const settings = {
                url: `${appSettings.service_map_backend}/accessibility_rule/`,
                success: data => {
                    this.rules = data.rules;
                    this.messages = data.messages;
                    return this.trigger('change');
                },
                error: (data, textStatus, errorThrown) => {
                    const context = {
                        tags: {
                            type: 'smbackend_accessibility_rule'
                        },
                        extra: {
                            data,
                            error_type: textStatus,
                            error_thrown: errorThrown
                        }
                    };
                    if (errorThrown) {
                        return Raven.captureException(errorThrown, context);
                    } else {
                        return Raven.captureMessage(
                            'Error fetching accessibility rules',
                            context);
                    }
                }
            };
            return Backbone.ajax(settings);
        }
        _emitShortcoming(rule, messages) {
            `\
Return value: false: message was empty, not emitted
              true: message was emitted\
`;
            if ((rule.msg === null) || !(rule.msg in this.messages)) {
                return false;
            }
            const msg = this.messages[rule.msg];
            if (msg == null) {
                return false;
            }

            const segment = rule.path[0];
            if (!(segment in messages)) {
                messages[segment] = [];
            }
            const segmentMessages = messages[segment];
            const requirementId = rule.requirement_id;
            if (!(requirementId in segmentMessages)) {
                segmentMessages[requirementId] = [];
            }

            const currentMessages = segmentMessages[requirementId];
            if (rule.id === requirementId) {
                // This is a top level requirement -
                // only add top level message
                // if there are no specific messages.
                if (!currentMessages.length) {
                    currentMessages.push(msg);
                    return true;
                }
            } else {
                currentMessages.push(msg);
                return true;
            }
            return true;
        }

        _calculateShortcomings(rule, properties, messages, level) {
            let isOkay, messageWasEmitted, op;
            if (level == null) { level = None; }
            if (!(rule.operands[0] instanceof Object)) {
                // This is a leaf rule.
                op = rule.operands;
                const prop = properties[op[0]];
                // If the information is not supplied, pretend that everything
                // is fine.
                if (!prop) {
                    return true;
                }
                const val = op[1];
                if (rule.operator === 'NEQ') {
                    isOkay = prop !== val;
                } else if (rule.operator === 'EQ') {
                    isOkay = prop === val;
                } else {
                    throw new Error(`invalid operator ${rule.operator}`);
                }
                if (!isOkay) {
                    messageWasEmitted = this._emitShortcoming(rule, messages);
                }
                return [isOkay, messageWasEmitted];
            }

            // This is a compound rule
            const retValues = [];
            const deeper_level = level + 1;
            for (op of Array.from(rule.operands)) {
                [isOkay, messageWasEmitted] = Array.from(this._calculateShortcomings(op, properties, messages, (level=deeper_level)));
                if ((rule.operator === 'AND') && !isOkay && !messageWasEmitted) {
                    // Short circuit AND evaluation when no message
                    // was emitted. This edge case is required!
                    return [false, false];
                }
                retValues.push(isOkay);
            }

            if (!['AND', 'OR'].includes(rule.operator)) {
                throw new Error(`invalid operator ${rule.operator}`);
            }
            if ((rule.operator === 'AND') && !Array.from(retValues).includes(false)) {
                return [true, false];
            }
            if ((rule.operator === 'OR') && Array.from(retValues).includes(true)) {
                return [true, false];
            }

            messageWasEmitted = this._emitShortcoming(rule, messages);
            return [false, messageWasEmitted];
        }

        getShortcomings(properties, profile) {
            if ((this.rules == null)) {
                return {status: 'pending'};
            }
            const propById = {};
            for (let p of Array.from(properties)) {
                propById[p.variable] = p.value;
            }
            const messages = {};
            const rule = this.rules[profile];
            let level = 0;
            this._calculateShortcomings(rule, propById, messages, (level=level));
            return {
                status: 'complete',
                messages
            };
        }

        getTranslatedShortcomings(profiles, model) {
            const shortcomings = {};
            const seen = {};
            for (let pid of Array.from(_.keys(profiles))) {
                const shortcoming = this.getShortcomings(model.get('accessibility_properties'), pid);
                if (shortcoming.status !== 'complete') {
                    return {status: 'pending', results: {}};
                }
                if (_.keys(shortcoming.messages).length) {
                    for (let segmentId in shortcoming.messages) {
                        const segmentMessages = shortcoming.messages[segmentId];
                        shortcomings[segmentId] = shortcomings[segmentId] || {};
                        for (let requirementId in segmentMessages) {
                            const messages = segmentMessages[requirementId];
                            const gatheredMessages = [];
                            for (let msg of Array.from(messages)) {
                                const translated = p13n.getTranslatedAttr(msg);
                                if (!(translated in seen)) {
                                    seen[translated] = true;
                                    gatheredMessages.push(msg);
                                }
                            }
                            if (gatheredMessages.length) {
                                shortcomings[segmentId][requirementId] = gatheredMessages;
                            }
                        }
                    }
                }
            }
            return {
                status: 'success',
                results: shortcomings
            };
        }
    }

    return new Accessibility;
});
