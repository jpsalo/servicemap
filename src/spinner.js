/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const _       = require('underscore');
    const Spinner = require('spin');

    var SMSpinner = (function() {
        let DEFAULTS = undefined;
        SMSpinner = class SMSpinner {
            static initClass() {
    
                DEFAULTS = {
                    lines: 12,                      // The number of lines to draw
                    length: 7,                      // The length of each line
                    width: 5,                       // The line thickness
                    radius: 10,                     // The radius of the inner circle
                    rotate: 0,                      // Rotation offset
                    corners: 1,                     // Roundness (0..1)
                    color: '#000',                  // #rgb or #rrggbb
                    direction: 1,                   // 1: clockwise, -1: counterclockwise
                    speed: 1,                       // Rounds per second
                    trail: 100,                     // Afterglow percentage
                    opacity: 1/4,                   // Opacity of the lines
                    fps: 20,                        // Frames per second when using setTimeout()
                    zIndex: 2e9,                    // Use a high z-index by default
                    className: 'spinner',           // CSS class to assign to the element
                    top: '50%',                     // center vertically
                    left: '50%',                    // center horizontally
                    position: 'absolute',            // element position
                    hideContainerContent: false
                };
                   // if true, hides all child elements inside spinner container
            }

            constructor(options) {
                this.options = _.extend(DEFAULTS, options);
                this.container = this.options.container;
                this.finished = false;
            }

            start() {
                if (this.finished) { return; }
                if (this.container) {
                    if (this.options.hideContainerContent) {
                        $(this.container).children().css('visibility', 'hidden');
                    }

                    return this.spinner = new Spinner(this.options).spin(this.container);
                }
            }

            stop() {
                this.finished = true;
                if (this.container && this.spinner) {
                    this.spinner.stop();
                    if (this.options.hideContainerContent) {
                        return $(this.container).children().css('visibility', 'visible');
                    }
                }
            }
        };
        SMSpinner.initClass();
        return SMSpinner;
    })();

    return SMSpinner;
});
