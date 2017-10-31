/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _          = require('underscore');
    const $          = require('jquery');
    const i18n       = require('i18next');

    const p13n       = require('app/p13n');
    const dateformat = require('app/dateformat');

    // Make sure jade runtime is loaded
    if (typeof jade !== 'object') {
        throw new Error("Jade not loaded before app");
    }

    const setHelper = function(data, name, helper) {
        if (name in data) {
            return;
        }
        return data[name] = helper;
    };

    class Jade {
        getTemplate(name) {
            const key = `views/templates/${name}`;
            if (!(key in JST)) {
                throw new Error(`template '${name}' not loaded`);
            }
            const templateFunc = JST[key];
            return templateFunc;
        }

        tAttr(attr) {
            return p13n.getTranslatedAttr(attr);
        }
        tAttrHasLang(attr) {
            if (!attr) {
                return false;
            }
            return p13n.getLanguage() in attr;
        }
        phoneI18n(num) {
            if (num.indexOf('0' === 0)) {
                // FIXME: make configurable
                num = `+358${num.substring(1)}`;
            }
            num = num.replace(/\s/g, '');
            num = num.replace(/-/g, '');
            return num;
        }
        staticPath(path) {
            // Strip leading slash
            if (path.indexOf('/') === 0) {
                path = path.substring(1);
            }
            return appSettings.static_path + path;
        }
        humanDateRange(startTime, endTime) {
            let hasEndTime;
            const formatted = dateformat.humanizeEventDatetime(
                startTime, endTime, 'small', (hasEndTime=false)
            );
            return formatted.date;
        }
        humanDistance(meters) {
            if (meters === Number.MAX_VALUE) {
                return "?";
            } else if (meters < 1000) {
                return `${Math.ceil(meters) }m`;
            } else {
                const val = Math.ceil(meters/100).toString();
                const [a, b] = Array.from([val.slice(0, -1), val.slice(-1)]);
                if (b !== "0") {
                    return `${a}.${b}km`;
                } else {
                    return `${a}km`;
                }
            }
        }
        humanShortcomings(count) {
            if (count === Number.MAX_VALUE) {
                return i18n.t('accessibility.no_data');
            } else if (count === 0) {
                return i18n.t('accessibility.no_shortcomings');
            } else {
                return i18n.t('accessibility.shortcoming_count', {count});
            }
        }
        humanDate(datetime) {
            let res;
            return res = dateformat.humanizeSingleDatetime(datetime);
        }
        uppercaseFirst(val) {
            return val.charAt(0).toUpperCase() + val.slice(1);
        }
        parsePostalcode(val) {
            return val.split('postinumero:')[1];
        }

        externalLink(href, name, attributes) {
            const data = {href, name};
            data.attributes = attributes || {};
            return this.template('external-link', data);
        }

        mixinHelpers(data) {
            const helpers = [
                ['t', i18n.t],
                ['tAttr', this.tAttr],
                ['tAttrHasLang', this.tAttrHasLang],
                ['translationExists', i18n.exists],
                ['phoneI18n', this.phoneI18n],
                ['staticPath', this.staticPath],
                ['humanDateRange', this.humanDateRange],
                ['humanDate', this.humanDate],
                ['humanDistance', this.humanDistance],
                ['uppercaseFirst', this.uppercaseFirst],
                ['parsePostalcode', this.parsePostalcode],
                ['humanShortcomings', this.humanShortcomings],
                ['pad', s => ` ${s} `],
                ['externalLink', _.bind(this.externalLink, this)]];

            for (let [name, method] of Array.from(helpers)) {
                setHelper(data, name, method);
            }
            return data;
        }

        template(name, locals) {
            if (locals != null) {
                if (typeof locals !== 'object') {
                    throw new Error("template must get an object argument");
                }
            } else {
                locals = {};
            }
            const func = this.getTemplate(name);
            const data = _.clone(locals);

            this.mixinHelpers(data);
            const templateStr = func(data);
            return $.trim(templateStr);
        }
    }

    return new Jade;
});
