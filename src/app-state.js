/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let AppState;
    const Backbone                = require('backbone');
    const models                  = require('app/models');
    const transit                 = require('app/transit');

    return (AppState = class AppState {
        constructor() {
            this.setDefaultState();
        }
        setDefaultState() {
            this.services = new models.ServiceList();
            this.selectedServices = new models.ServiceList();
            this.units = new models.UnitList(null, {setComparator: true});
            this.selectedUnits = new models.UnitList();
            this.selectedEvents = new models.EventList();
            this.searchResults = new models.SearchList([], {pageSize: appSettings.page_size});
            this.searchState = new models.WrappedModel();
            this.route = new transit.Route();
            this.routingParameters = new models.RoutingParameters();
            this.selectedPosition = new models.WrappedModel();
            this.selectedDivision = new models.WrappedModel();
            this.divisions = new models.AdministrativeDivisionList;
            this.statistics = new models.PopulationStatistics;
            this.pendingFeedback = new models.FeedbackMessage();
            this.dataLayers = new Backbone.Collection([], {model: Backbone.Model});
            this.selectedDataLayers = new Backbone.Model();
            this.informationalMessage = new Backbone.Model();
            return this.cancelToken = new models.WrappedModel();
        }
        setState(other) {
            return (() => {
                const result = [];
                for (let key in this) {
                    const val = this[key];
                    if (key === 'cancelToken') { continue; }
                    if ((val != null) && (typeof val === 'object') && (typeof other[key].restoreState === 'function')) {
                        result.push(this[key].restoreState(other[key]));
                    } else {
                        result.push(undefined);
                    }
                }
                return result;
            })();
        }
        clone() {
            const other = new AppState();
            other.setState(this);
            return other;
        }
        isEmpty() {
            return this.selectedServices.isEmpty() && 
            this.selectedUnits.isEmpty() && 
            this.selectedEvents.isEmpty() && 
            this.searchResults.isEmpty() && 
            this.selectedPosition.isEmpty();
        }
    });
});
