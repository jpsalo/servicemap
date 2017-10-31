/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let ResourceReservationCompositeView;
    const backbone = require('backbone');
    const _ = require('underscore');
    const b = require('app/views/base');

    class ResourceItemView extends b.SMItemView {
        static initClass() {
            this.prototype.template = 'resource-item';
            this.prototype.tagName = 'li';
        }
    }
    ResourceItemView.initClass();

    return ResourceReservationCompositeView = (function() {
        ResourceReservationCompositeView = class ResourceReservationCompositeView extends b.SMCompositeView {
            static initClass() {
                this.prototype.className = 'resource-reservation-list';
                this.prototype.template = 'resource-reservation';
                this.prototype.childView = ResourceItemView;
                this.prototype.childViewContainer = '#resource-reservation';
            }
            initialize({model}) {
                this.model = model;
                this.collection = new Backbone.Collection();
                super.initialize({collection: this.collection, model: this.model});
                return this.getUnitResources();
            }
            getUnitResources() {
                const unitId = this.model.get('id');
                return $.ajax({
                    dataType: 'json',
                    url: `${appSettings.respa_backend}/resource/?unit=tprek:${unitId}&page_size=100`,
                    success: data => {
                        if (data.results.length < 1) {
                            return;
                        }
                        this.collection.reset(_.map(data.results, ({name, id}) => {
                            return new Backbone.Model({name, id});
                    })
                        );
                        return this.trigger('ready');
                    },
                    error(jqXHR, testStatus, errorThrown) {}
                });
            }
        };
        ResourceReservationCompositeView.initClass();
        return ResourceReservationCompositeView;
    })();
});
