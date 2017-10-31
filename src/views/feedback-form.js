/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    let FeedbackFormView;
    const _                                = require('underscore');
    const {t}                              = require('i18next');

    const base                             = require('app/views/base');
    const jade                             = require('app/jade');
    const AccessibilityPersonalisationView = require('app/views/accessibility-personalisation');

    return FeedbackFormView = (function() {
        FeedbackFormView = class FeedbackFormView extends base.SMLayout {
            static initClass() {
    
                this.prototype.className = 'content modal-dialog';
                this.prototype.regions =
                    {accessibility: '#accessibility-section'};
                this.prototype.events = {
                    'submit': '_submit',
                    'change input[type=checkbox]': '_onCheckboxChanged',
                    'change input[type=radio]': '_onRadioButtonChanged',
                    'click .personalisations li': '_onPersonalisationClick',
                    'blur input[type=text]': '_onFormInputBlur',
                    'blur input[type=email]': '_onFormInputBlur',
                    'blur textarea': '_onFormInputBlur'
                };
            }
            getTemplate() {
                if ((this.opts != null ? this.opts.internalFeedback : undefined)) {
                    this.template = 'feedback-form';
                } else {
                    this.template = 'unit-feedback-form';
                }
                return jade.getTemplate(this.template);
            }

            initialize({unit, model, opts}) {
                this.unit = unit;
                this.model = model;
                this.opts = opts;
            }

            onShow() {
                if (this.unit) {
                    const viewPoints = this.model.get('accessibility_viewpoints') || [];
                    return this.accessibility.show(new AccessibilityPersonalisationView({activeModes: viewPoints}));
                }
            }

            onDomRefresh() {
                return this._adaptInputWidths(this.$el, 'input[type=text]');
            }

            serializeData() {
                const keys = [
                    'title', 'first_name', 'description',
                    'email', 'accessibility_viewpoints',
                    'can_be_published', 'service_request_type'
                ];
                const value = key => this.model.get(key) || '';
                const values = _.object(keys, _(keys).map(value));
                values.accessibility_enabled = this.model.get('accessibility_enabled') || false;
                values.email_enabled = this.model.get('email_enabled') || false;
                values.can_be_published = this.model.get('can_be_published') || false;
                if (this.unit) {
                    values.unit = this.unit.toJSON();
                }
                return values;
            }

            _adaptInputWidths($el, selector) {
                return _.defer(() => {
                    $el.find(selector).each(function() {
                        const pos = $(this).position().left;
                        let width = 440;
                        width -= pos;
                        return $(this).css('width', `${width}px`);
                    });
                    return $el.find('textarea').each(function() { return $(this).css('width', "460px"); });
                });
            }

            _submit(ev) {
                ev.preventDefault();
                if (this.unit != null) {
                    this.model.set('unit', this.unit);
                }
                return this.model.save();
            }

            _onCheckboxChanged(ev) {
                const target = ev.currentTarget;
                const { checked } = target;
                const $hiddenSection = $(target).closest('.form-section').find('.hidden-section');
                if (checked) {
                    $hiddenSection.removeClass('hidden');
                    this._adaptInputWidths($hiddenSection, 'input[type=email]');
                } else {
                    $hiddenSection.addClass('hidden');
                }
                return this._setModelField(this._getModelFieldId($(target)), checked);
            }

            _onRadioButtonChanged(ev) {
                let attrName;
                const $target = $(ev.currentTarget);
                const name = $target.attr('name');
                const value = $target.val();
                return this.model.set(this._getModelFieldId($target, (attrName='name')), value);
            }

            _onFormInputBlur(ev) {
                const $target = $(ev.currentTarget);
                const contents = $target.val();
                const id = this._getModelFieldId($target);
                const success = this._setModelField(id, contents);
                const $container = $target.closest('.form-section').find('.validation-error');
                if (success) {
                    return $container.addClass('hidden');
                } else {
                    const error = this.model.validationError;
                    $container.html(t(`feedback.form.validation.${error[id]}`));
                    return $container.removeClass('hidden');
                }
            }

            _getModelFieldId($target, attrName) {
                if (attrName == null) { attrName = 'id'; }
                try {
                    return $target.attr(attrName).replace(/open311-/, '');
                } catch (TypeError) {
                    return null;
                }
            }

            _setModelField(id, val) {
                return this.model.set(id, val, {validate: true, fieldKey: id});
            }

            _onPersonalisationClick(ev) {
                const $target = $(ev.currentTarget);
                const type = $target.data('type');
                $target.closest('#accessibility-section').find('li').removeClass('selected');
                $target.addClass('selected');
                return this.model.set('accessibility_viewpoints', [type]);
            }
        };
        FeedbackFormView.initClass();
        return FeedbackFormView;
    })();});
