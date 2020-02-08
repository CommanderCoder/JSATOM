define(['./6847_fontdata', './utils'], function (fontData, utils) {
    "use strict";

    function Video6847()
    {


        this.init = function() {
            this.curGlyphs = fontData.makeCharsAtom();
        };


        this.init();
    }

    Video6847.prototype.setDEW = function (level) {
        this.scanlineCounter = 0;
    };

    Video6847.prototype.setDISPTMG = function (level) {
        this.scanlineCounter++;
        // Check for end of character row.
        if (this.scanlineCounter === 12) {
            this.scanlineCounter = 0;
        }
    };


    Video6847.prototype.blitChar = function ( buf, data, destOffset, numPixels )
    {
        var scanline = this.scanlineCounter;
        var chardef = this.curGlyphs[data  * 12 + scanline];


        destOffset |= 0;
        numPixels |= 0;
        var fb32 = buf;
        var i = 0;
        for (i = 0; i < numPixels; ++i) {
            fb32[destOffset + i] = ((chardef>>>i)&0x1)?0xffffffff:0x0; //white  - see 'collook'
        }

    }

    return Video6847;
});
