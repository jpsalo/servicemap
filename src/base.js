/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(() =>
    ({
        mixOf(base, ...mixins) {
            let Mixed;
            return Mixed = (function() {
                Mixed = class Mixed extends base {
                    static initClass() {
                        for (let i = mixins.length - 1; i >= 0; i--) { // earlier mixins override later ones
                            const mixin = mixins[i];
                            for (let name in mixin.prototype) {
                                const method = mixin.prototype[name];
                                Mixed.prototype[name] = method;
                            }
                        }
                        Mixed;
                    }
                };
                Mixed.initClass();
                return Mixed;
            })();
        },

        resolveImmediately() {
            return $.Deferred().resolve().promise();
        },

        withDeferred(callback) {
            const deferred = $.Deferred();
            callback(deferred);
            return deferred.promise();
        },

        pad(number) {
            const str = `${number}`;
            const pad = "00000";
            return pad.substring(0, pad.length - str.length) + str;
        },

        getIeVersion() {
            // From https://codepen.io/gapcode/pen/vEJNZN
            // courtesy of Mario

            const ua = window.navigator.userAgent;
            // Test values; Uncomment to check result …
            // IE 10
            // ua = 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)';
            // IE 11
            // ua = 'Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko';
            // Edge 12 (Spartan)
            // ua = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36 Edge/12.0';
            // Edge 13
            // ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2486.0 Safari/537.36 Edge/13.10586';
            const msie = ua.indexOf('MSIE ');
            if (msie > 0) {
                // IE 10 or older => return version number
                return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
            }

            const trident = ua.indexOf('Trident/');
            if (trident > 0) {
                // IE 11 => return version number
                const rv = ua.indexOf('rv:');
                return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
            }

            const edge = ua.indexOf('Edge/');
            if (edge > 0) {
                // Edge (IE 12+) => return version number
                return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
            }
            // other browser
            return false;
        },

        getLangURL(code) {
            const languageSubdomain = {
                fi: 'palvelukartta',
                sv: 'servicekarta',
                en: 'servicemap'
            };
            const { href } = window.location;
            if (href.match(/^http[s]?:\/\/[^.]+\.hel\..*/)) {
                return href.replace(/\/\/[^.]+./, `//${languageSubdomain[code]}.`);
            } else {
                return href;
            }
        }
    })
);
