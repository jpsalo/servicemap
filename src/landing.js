/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function() {

    const clearLandingPage = function() {
        // The transitions triggered by removing the class landing from body are defined
        // in the file landing-page.less.
        // When key animations have ended a 'landing-page-cleared' event is triggered.
        if ($('body').hasClass('landing')) {
            $('body').removeClass('landing');
            return $('#navigation-region').one('transitionend webkitTransitionEnd otransitionend oTransitionEnd MSTransitionEnd', function(event) {
                app.vent.trigger('landing-page-cleared');
                return $(this).off('transitionend webkitTransitionEnd oTransitionEnd MSTransitnd');
                });
        }
    };
    return {
        clear: clearLandingPage
    };});
