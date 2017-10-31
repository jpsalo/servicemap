/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
define(function(require) {
    const TweenLite = require('TweenLite');
    const CSSPlugin = require('CSSPlugin');
    const EasePack = require('EasePack');

    const HORIZONTAL_MARGIN = 4;
    const DURATION_IN_SECONDS = 0.3;

    const getStartingLeft = function(contentWidth, animation) {
        switch (animation) {
            case 'left': return contentWidth + HORIZONTAL_MARGIN;
            case 'right': return -contentWidth - HORIZONTAL_MARGIN;
            default: return 0;
        }
    };

    const getStartingTop = function(contentHeight, animation) {
        switch (animation) {
            case 'left': return -contentHeight;
            case 'right': return -contentHeight;
            default: return 0;
        }
    };

    const getMoveDistanceInPx = function(distance, animation) {
        switch (animation) {
            case 'left': return `-=${distance}px`;
            case 'right': return `+=${distance}px`;
            default: return 0;
        }
    };

    const render = function($container, $oldContent, $newContent, animation, callback) {
        // Add new content to DOM after the old content.
        $container.append($newContent);

        // Measurements - calculate how much the new content needs to be moved.
        const contentHeight = $oldContent.height();
        const contentWidth = $oldContent.width();
        const moveDistance = getMoveDistanceInPx(contentWidth + HORIZONTAL_MARGIN, animation);

        // Move the new content to correct starting position.
        $newContent.css({
            'position': 'relative',
            'left': getStartingLeft(contentWidth, animation),
            'top': getStartingTop(contentHeight, animation)
        });

        // Make sure the old old content is has position: relative for animations.
        $oldContent.css({'position': 'relative'});

        // Animate old content and new content.
        return TweenLite.to([$oldContent, $newContent], DURATION_IN_SECONDS, {
            left: moveDistance,
            ease: Power2.easeOut,
            onComplete() {
                $oldContent.remove();
                $newContent.css({'left': 0, 'top': 0});
                return (typeof callback === 'function' ? callback() : undefined);
            }
        });
    };

    return {
        render
    };});
