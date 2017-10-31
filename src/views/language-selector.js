/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let LanguageSelectorView;
    const _            = require('underscore');

    const models       = require('app/models');
    const base         = require('app/views/base');
    const {getLangURL} = require('app/base');

    return LanguageSelectorView = (function() {
        LanguageSelectorView = class LanguageSelectorView extends base.SMItemView {
            static initClass() {
                this.prototype.template = 'language-selector';
            }
            // events:
            //     'click .language': 'selectLanguage'
            initialize(opts) {
                this.p13n = opts.p13n;
                this.languages = this.p13n.getSupportedLanguages();
                this.refreshCollection();
                return this.listenTo(p13n, 'url', () => {
                    return this.render();
                });
            }
            serializeData() {
                const data = super.serializeData();
                for (let i in data.items) {
                    const val = data.items[i];
                    val.link = getLangURL(val.code);
                }
                return data;
            }
            refreshCollection() {
                const selected = this.p13n.getLanguage();
                const languageModels = _.map(this.languages, l =>
                    new models.Language({
                        code: l.code,
                        name: l.name,
                        selected: l.code === selected
                    })
                );
                return this.collection = new models.LanguageList(_.filter(languageModels, l => !l.get('selected')));
            }
        };
        LanguageSelectorView.initClass();
        return LanguageSelectorView;
    })();
});
