/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const Backbone  = require('backbone');

    const baseviews = require('app/views/base');

    class EmbeddedMap extends Backbone.View {
        // Todo: re-enable functionality
        initialize(options){
            this.mapView = options.mapView;
            this.listenTo(app.vent, 'unit:render-one', this.renderUnit);
            this.listenTo(app.vent, 'units:render-with-filter', this.renderUnitsWithFilter);
            return this.listenTo(app.vent, 'units:render-category', this.renderUnitsByCategory);
        }

        renderUnitsByCategory(isSelected) {
            const publicCategories = [100, 101, 102, 103, 104];
            const privateCategories = [105];

            const onlyCategories = categoriesArray => model => _.contains(categoriesArray, model.get('provider_type'));

            const publicUnits = this.unitList.filter(onlyCategories(publicCategories));
            const privateUnits = this.unitList.filter(onlyCategories(privateCategories));
            const unitsInCategory = [];

            if (!isSelected.public) { _.extend(unitsInCategory, publicUnits); }
            if (!isSelected.private) { _.extend(unitsInCategory, privateUnits); }

            return this.mapView.drawUnits(new models.UnitList(unitsInCategory));
        }

        fetchAdministrativeDivisions(params, callback){
            const divisions = new models.AdministrativeDivisionList();
            return divisions.fetch({
                data: { ocd_id: params
            },
                success: callback
            });
        }

        findUniqueAdministrativeDivisions(collection) {
            const byName = divisionModel => divisionModel.toJSON().name;
            const divisionNames = collection.chain().map(byName).compact().unique().value();
            const divisionNamesPartials = {};
            if (divisionNames.length > 1) {
                divisionNamesPartials.start = _.initial(divisionNames).join(', ');
                divisionNamesPartials.end = _.last(divisionNames);
            } else { divisionNamesPartials.start = divisionNames[0]; }

            return app.vent.trigger('administration-divisions-fetched', divisionNamesPartials);
        }
    }

    class TitleBarView extends baseviews.SMItemView {
        constructor(...args) {
            {
              // Hack: trick Babel/TypeScript into allowing this before super.
              if (false) { super(); }
              let thisFn = (() => { this; }).toString();
              let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
              eval(`${thisName} = this;`);
            }
            this.divisionNames = this.divisionNames.bind(this);
            super(...args);
        }

        static initClass() {
            this.prototype.template = 'embedded-title-bar';
            this.prototype.className = 'panel panel-default';
            this.prototype.events = {
                'click a': 'preventDefault',
                'click .show-button': 'toggleShow',
                'click .panel-heading': 'collapseCategoryMenu'
            };
        }

        initialize(model) {
            this.model = model;
            return this.listenTo(this.model, 'sync', this.render);
        }

        divisionNames(divisions) {
            return divisions.pluck('name');
        }

        serializeData() {
            return {divisions: this.divisionNames(this.model)};
        }
        show() {
            this.delegateEvents;
            return this.$el.removeClass('hide');
        }

        hide() {
            this.undelegateEvents();
            return this.$el.addClass('hide');
        }

        preventDefault(ev) {
            return ev.preventDefault();
        }

        toggleShow(ev){
            const publicToggle = this.$('.public');
            const privateToggle = this.$('.private');

            const target = $(ev.target);
            target.toggleClass('selected');

            const isSelected = {
                public: publicToggle.hasClass('selected'),
                private: privateToggle.hasClass('selected')
            };

            return app.vent.trigger('units:render-category', isSelected);
        }

        collapseCategoryMenu() {
            return $('.panel-heading').toggleClass('open');
        }
    }
    TitleBarView.initClass();
            //$('.collapse').collapse 'toggle'

    return TitleBarView;
});
