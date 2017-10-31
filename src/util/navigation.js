/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const Backbone = require('backbone');

    return {
        isFrontPage: () => {
            return Backbone.history.fragment === '';
        }
    };
});
