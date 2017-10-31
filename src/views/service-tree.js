/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let ServiceTreeView;
    const _      = require('underscore');
    const i18n   = require('i18next');

    const models = require('app/models');
    const base   = require('app/views/base');

    return ServiceTreeView = (function() {
        ServiceTreeView = class ServiceTreeView extends base.SMLayout {
            static initClass() {
                this.prototype.id = 'service-tree-container';
                this.prototype.className = 'navigation-element';
                this.prototype.template = 'service-tree';
                this.prototype.type = 'service-tree';
            }
            events() {
                const openOnKbd = this.keyboardHandler(this.openService, ['enter']);
                const toggleOnKbd = this.keyboardHandler(this.toggleLeafButton, ['enter', 'space']);
                return {
                    'click .service.has-children': 'openService',
                    'keydown .service.parent': openOnKbd,
                    'keydown .service.has-children': openOnKbd,
                    'keydown .service.has-children a.show-icon': toggleOnKbd,
                    'click .service.parent': 'openService',
                    'click .collapse-button': 'openService',
                    'click .crumb': 'handleBreadcrumbClick',
                    'click .service.leaf': 'toggleLeaf',
                    'keydown .service.leaf': toggleOnKbd,
                    'click .service .show-services-button': 'toggleButton',
                    'mouseenter .service .show-services-button': 'showTooltip',
                    'mouseleave .service .show-services-button': 'removeTooltip'
                };
            }

            hideContents() {
                return this.$el.find('.main-list').hide();
            }

            showContents() {
                return this.$el.find('.main-list').show();
            }

            initialize(options) {
                this.selectedServices = options.selectedServices;
                this.breadcrumbs = options.breadcrumbs;
                this.animationType = 'left';
                this.scrollPosition = 0;
                this.listenTo(this.selectedServices, 'remove', (service, coll) => {
                    if (coll.isEmpty()) {
                        return this.render();
                    }
                });
                this.listenTo(this.selectedServices, 'add', this.render);
                return this.listenTo(this.selectedServices, 'reset', this.render);
            }

            toggleLeaf(event) {
                return this.toggleElement($(event.currentTarget).find('.show-badge-button'));
            }
            toggleLeafButton(event) {
                return this.toggleElement($(event.currentTarget));
            }

            toggleButton(event) {
                this.removeTooltip();
                event.preventDefault();
                event.stopPropagation();
                return this.toggleElement($(event.target));
            }

            showTooltip(event) {
                const tooltipContent = ($(event.target)).hasClass('selected') ? 
                    `<div id=\"tooltip\">${i18n.t('sidebar.hide_tooltip')}</div>` : 
                    `<div id=\"tooltip\">${i18n.t('sidebar.show_tooltip')}</div>`;
                this.removeTooltip();
                this.$tooltipElement = $(tooltipContent);
                const $targetEl = $(event.currentTarget);
                $('body').append(this.$tooltipElement);
                const buttonOffset = $targetEl.offset();
                const originalOffset = this.$tooltipElement.offset();
                this.$tooltipElement.css('top', `${buttonOffset.top + originalOffset.top}px`);
                return this.$tooltipElement.css('left', `${buttonOffset.left + originalOffset.left + 30}px`);
            }
            removeTooltip(event) {
                return (this.$tooltipElement != null ? this.$tooltipElement.remove() : undefined);
            }

            getShowButtonClasses(showing, rootId) {
                if (showing) {
                    return `show-badge-button selected service-background-color-${rootId}`;
                } else {
                    return `show-badge-button service-hover-background-color-light-${rootId}`;
                }
            }

            toggleElement($targetElement) {
                const serviceId = $targetElement.closest('li').data('service-id');
                if (this.selected(serviceId)) {
                    return app.request('removeService', serviceId);
                } else {
                    const service = new models.Service({id: serviceId});
                    return service.fetch({
                        success: () => {
                            return app.request('addService', service, {});
                        }});
                }
            }

            handleBreadcrumbClick(event) {
                event.preventDefault();
                // We need to stop the event from bubling to the containing element.
                // That would make the service tree go back only one step even if
                // user is clicking an earlier point in breadcrumbs.
                event.stopPropagation();
                return this.openService(event);
            }

            openService(event) {
                const $target = $(event.currentTarget);
                let serviceId = $target.data('service-id');
                const serviceName = $target.data('service-name');
                this.animationType = $target.data('slide-direction');

                // If the click goes to collapse-btn
                if ($target.hasClass('collapse-button')) {
                    this.toggleCollapse(event);
                    return false;
                }

                if (!serviceId) {
                    return null;
                }

                if (serviceId === 'root') {
                    serviceId = null;
                    // Use splice to affect the original breadcrumbs array.
                    this.breadcrumbs.splice(0, this.breadcrumbs.length);
                } else {
                    // See if the service is already in the breadcrumbs.
                    const index = _.indexOf(_.pluck(this.breadcrumbs, 'serviceId'), serviceId);
                    if (index !== -1) {
                        // Use splice to affect the original breadcrumbs array.
                        this.breadcrumbs.splice(index, this.breadcrumbs.length - index);
                    }
                    this.breadcrumbs.push({serviceId, serviceName});
                }

                const spinnerOptions = {
                    container: $target.get(0),
                    hideContainerContent: true
                };
                return this.collection.expand(serviceId, spinnerOptions);
            }

            onDomRefresh() {
                if (this.serviceToDisplay) {
                    const $targetElement = this.$el.find(`[data-service-id=${this.serviceToDisplay.id}]`).find('.show-badge-button');
                    this.serviceToDisplay = false;
                    this.toggleElement($targetElement);
                }

                const $ul = this.$el.find('ul');
                $ul.on('scroll', ev => {
                    return this.scrollPosition = ev.currentTarget.scrollTop;
            });
                $ul.scrollTop(this.scrollPosition);
                this.scrollPosition = 0;
                return this.setBreadcrumbWidths();
            }

            setBreadcrumbWidths() {
                const CRUMB_MIN_WIDTH = 40;
                // We need to use the last() jQuery method here, because at this
                // point the animations are still running and the DOM contains,
                // both the old and the new content. We only want to get the new
                // content and its breadcrumbs as a basis for our calculations.
                const $container = this.$el.find('.header-item').last();
                let $crumbs = $container.find('.crumb');
                if (!($crumbs.length > 1)) { return; }

                // The last breadcrumb is given preference, so separate that from the
                // rest of the breadcrumbs.
                const $lastCrumb = $crumbs.last();
                $crumbs = $crumbs.not(':last');

                const $chevrons = $container.find('.icon-icon-forward');
                const spaceAvailable = $container.width() - ($chevrons.length * $chevrons.first().outerWidth());
                let lastWidth = $lastCrumb.width();
                const spaceNeeded = lastWidth + ($crumbs.length * CRUMB_MIN_WIDTH);

                if (spaceNeeded > spaceAvailable) {
                    // Not enough space -> make the last breadcrumb narrower.
                    lastWidth = spaceAvailable - ($crumbs.length * CRUMB_MIN_WIDTH);
                    $lastCrumb.css({'max-width': lastWidth});
                    return $crumbs.css({'max-width': CRUMB_MIN_WIDTH});
                } else {
                    // More space -> Make the other breadcrumbs wider.
                    const crumbWidth = (spaceAvailable - lastWidth) / $crumbs.length;
                    return $crumbs.css({'max-width': crumbWidth});
                }
            }

            selected(serviceId) {
                return (this.selectedServices.get(serviceId) != null);
            }
            close() {
                this.removeTooltip();
                this.remove();
                return this.stopListening();
            }

            serializeData() {
                let rootId;
                const classes = function(category) {
                    if (category.get('children').length > 0) {
                        return ['service has-children'];
                    } else {
                        return ['service leaf'];
                    }
                };

                const listItems = this.collection.map(category => {
                    const selected = this.selected(category.id);

                    rootId = category.get('root');

                    return {
                        id: category.get('id'),
                        name: category.getText('name'),
                        classes: classes(category).join(" "),
                        has_children: category.attributes.children.length > 0,
                        unit_count: category.attributes.unit_count || 1,
                        selected,
                        root_id: rootId,
                        show_button_classes: this.getShowButtonClasses(selected, rootId)
                    };
                });

                const parentItem = {};
                let back = null;

                if (this.collection.chosenService) {
                    back = this.collection.chosenService.get('parent') || 'root';
                    parentItem.name = this.collection.chosenService.getText('name');
                    parentItem.rootId = this.collection.chosenService.get('root');
                }

                const data = {
                    collapsed: this.collapsed || false,
                    back,
                    parent_item: parentItem,
                    list_items: listItems,
                    breadcrumbs: _.initial(this.breadcrumbs) // everything but the last crumb
                };
                return data;
            }

            onDomRefresh() {
                let $target = null;
                if (this.collection.chosenService) {
                    $target = this.$el.find('li.service.parent.header-item');
                } else {
                    $target = this.$el.find('li.service').first();
                }
                return _.defer(() => {
                    return $target
                    .focus()
                    .addClass('autofocus')
                    .on('blur', () => $target.removeClass('autofocus'));
                });
            }
        };
        ServiceTreeView.initClass();
        return ServiceTreeView;
    })();
});
