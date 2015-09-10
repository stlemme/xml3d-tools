(function() {
    /*************************************************************************/
    /*                                                                       */
    /*  camera.js                                                            */
    /*  Simple navigation for XML3D scenes                                   */
    /*                                                                       */
    /*  Copyright (C) 2015                                                   */
    /*  DFKI - German Research Center for Artificial Intelligence            */
    /*                                                                       */
    /*************************************************************************/

    if(!XML3D)
        throw("XML3D not found, please ensure the camera script is included after xml3d.js");

    /**
     * The StandardCamera offers basic mouse and touch interaction with an XML3D scene.
     *
     * @param {HTMLElement} element The element that this camera will control
     * @param {Object} opt
     * @constructor
     */
    XML3D.StandardCamera = function(element, opt) {
        if (!element) {
            throw("Must provide an element to control when initializing the StandardCamera!");
        }
        if (element.hasAttribute("style")) {
            XML3D.debug.logWarning("This camera controller does not support CSS transforms, unexpected things may happen! Try using a <transform> element instead.");
        }

        opt = opt || {};
        this.element = element;
        this.xml3d = this.getXML3DForElement(element);

        var mode = opt.mode || "examine";
        this.mode = this.MODES[mode];
        
        this.touchTranslateMode = opt.touchTranslateMode || "twofinger";
        
        this.mousemovePicking = true;

        this.transformInterface = new TransformInterface(this.element, this.xml3d);
        this.prevPos = {x: -1, y: -1};
        this.prevTouchPositions = [];
        this.prevTouchPositions[0] = {
            x : -1,
            y : -1
        };
        this.prevZoomVectorLength = null;

        this.options = {};
        this.options.rotateSpeed = opt.rotateSpeed || 1.5;
        this.options.zoomSpeed = opt.zoomSpeed || 20;
        this.options.moveSpeed = opt.moveSpeed || this.options.zoomSpeed * 0.05;
        this.options.useKeys = opt.useKeys || false;
        this.options.updateExaminePoint = opt.updateExaminePoint || false;
        this.options.dragging = opt.dragging || true;
        this.options.upVector = new XML3D.Vec3(opt.upVector || this.transformInterface.upVector);
        
        this.action = this.NO_ACTION;
        this.state = {
            //Note: The examine point is relative to the element's parent coordinate space.
            examinePoint: opt.examinePoint || this.getInverseTranslationOfParent(element)
        };

        this.attach();
    };

    /**
     * Translate the camera by the given vector
     * @param {XML3D.Vec3} vec The vector to translate the camera by
     */
    XML3D.StandardCamera.prototype.translate = function(vec) {
        this.transformInterface.translate(vec);
    };

    /**
     * Rotate the camera with the given quaternion rotation
     * @param {XML3D.Quat} rot The quaternion rotation to rotate the camera with
     */
    XML3D.StandardCamera.prototype.rotate = function(rot) {
        this.transformInterface.rotate(rot);
    };

    /**
     * Moves the camera to a new position and orientation that centers on the given object. After calling this the camera
     * will be positioned in front of the object looking down the Z axis at it. The camera will be placed far enough away
     * that the whole object is visible. If in examine mode the examine point will be set to the center of the object.
     *
     * @param {HTMLElement} element The element to be examined. May be a <group>, <mesh> or <model> tag.
     */
    XML3D.StandardCamera.prototype.examine = function(element) {
        if (!element.getWorldBoundingBox) {
            XML3D.debug.logError(element + " is not a valid examine target. Valid target elements include <group>, <mesh> and <model>.");
            return;
        }
        var bb = element.getWorldBoundingBox();
        var center = bb.center();
        var r = center.len();
        var newPos = center.clone();
        newPos.z += r / Math.tan(this.transformInterface.fieldOfView / 2);
        this.transformInterface.position = newPos;
        this.transformInterface.orientation = new XML3D.Quat();
        this.state.examinePoint = bb.center();
    };

    /**
     * Orient the camera to look at the given point
     *
     * @param {XML3D.Vec3} point
     */
    XML3D.StandardCamera.prototype.lookAt = function(point) {
        this.transformInterface.lookAt(point);
    };

    /**
     * Start listening for input events.
     */
    XML3D.StandardCamera.prototype.attach = function() {
        var self = this;
        this._evt_mousedown = function(e) {self.mousePressEvent(e);};
        this._evt_mouseup = function(e) {self.mouseReleaseEvent(e);};
        this._evt_mousemove = function(e) {self.mouseMoveEvent(e);};
        this._evt_contextmenu = function(e) {self.stopEvent(e);};
        this._evt_keydown = function(e) {self.keyHandling(e);};

        this._evt_touchstart = function(e) {self.touchStartEvent(e);};
        this._evt_touchmove = function(e) {self.touchMoveEvent(e);};
        this._evt_touchend = function(e) {self.touchEndEvent(e);};
        this._evt_touchcancel = function(e) {self.touchEndEvent(e);};


        this.xml3d.addEventListener("mousedown", this._evt_mousedown, false);
        document.addEventListener("mouseup", this._evt_mouseup, false);
        document.addEventListener("mousemove",this._evt_mousemove, false);

        this.xml3d.addEventListener("touchstart", this._evt_touchstart, false);
        document.addEventListener("touchend", this._evt_touchend, false);
        document.addEventListener("touchmove",this._evt_touchmove, false);
        document.addEventListener("touchcancel", this._evt_touchend, false);

        this.xml3d.addEventListener("contextmenu", this._evt_contextmenu, false);
        if (this.options.useKeys)
            document.addEventListener("keydown", this._evt_keydown, false);
    };

    /**
     * Stop listening for input events.
     */
    XML3D.StandardCamera.prototype.detach = function() {
        this.xml3d.removeEventListener("mousedown", this._evt_mousedown, false);
        document.removeEventListener("mouseup", this._evt_mouseup, false);
        document.removeEventListener("mousemove",this._evt_mousemove, false);

        this.xml3d.removeEventListener("touchstart", this._evt_touchstart, false);
        document.removeEventListener("touchend", this._evt_touchend, false);
        document.removeEventListener("touchmove",this._evt_touchmove, false);
        document.removeEventListener("touchcancel", this._evt_touchend, false);

        this.xml3d.removeEventListener("contextmenu", this._evt_contextmenu, false);
        if (this.options.useKeys)
            document.removeEventListener("keydown", this._evt_keydown, false);
    };


    //---------- End public API ----------------


    XML3D.StandardCamera.prototype.__defineGetter__("width", function() { return this.xml3d.clientWidth; });
    XML3D.StandardCamera.prototype.__defineGetter__("height", function() { return this.xml3d.clientHeight; });

    XML3D.StandardCamera.prototype.getXML3DForElement = function(element) {
        var node = element.parentNode;
        while (node && node.localName !== "xml3d") {
            node = node.parentNode;
        }
        if (!node) {
            throw("Could not find the root XML3D element for the given element.");
        }
        return node;
    };

    XML3D.StandardCamera.prototype.getInverseTranslationOfParent = function(element) {
        if (!element.parentElement.getWorldMatrix) {
            return XML3D.Vec3.fromValues(0,0,0);
        }
        var tmat = element.parentElement.getWorldMatrix();
        tmat = tmat.invert();
        return XML3D.Vec3.fromValues(tmat.m41, tmat.m42, tmat.m43);
    };

    XML3D.StandardCamera.prototype.stopEvent = function(ev) {
        if (ev.preventDefault)
            ev.preventDefault();
        if (ev.stopPropagation)
            ev.stopPropagation();
        ev.returnValue = false;
    };
    
    
    XML3D.StandardCamera.prototype.NO_ACTION = null;
    
    XML3D.StandardCamera.prototype.TRANSLATE = {
        move: function (x, y, dx, dy) {
            var f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
            dx = f*dx * this.options.zoomSpeed;
            dy = f*dy * this.options.zoomSpeed;
            var trans = XML3D.Vec3.fromValues(-dx, dy, 0.0);
            this.transformInterface.translate(this.transformInterface.inverseTransformOf(trans));
        }
    };
    
    XML3D.StandardCamera.prototype.DOLLY = {
        move: function (x, y, dx, dy) {
            dy = this.options.zoomSpeed * dy / this.height;
            this.transformInterface.translate(this.transformInterface.inverseTransformOf(XML3D.Vec3.fromValues(0, 0, dy)));
        }
    };
    
    XML3D.StandardCamera.prototype.ROTATE = {
        start: function (x, y) {
            if (!this.options.updateExaminePoint) return;
            var ray = this.xml3d.generateRay(x, y);
            this.state.examinePoint = this.intersectScene(ray);
        },
        move: function (x, y, dx, dy) {
            dx = -this.options.rotateSpeed * dx * 2.0 * Math.PI / this.width;
            dy = -this.options.rotateSpeed * dy * 2.0 * Math.PI / this.height;

            var mx = XML3D.Quat.fromAxisAngle([0,1,0], dx);
            var my = XML3D.Quat.fromAxisAngle([1,0,0], dy);
            mx = mx.mul(my);
            this.transformInterface.rotateAroundPoint(mx, this.state.examinePoint);
        }
    };
    
    XML3D.StandardCamera.prototype.LOOKAROUND = {
        move: function (x, y, dx, dy) {
            dx = -this.options.rotateSpeed * dx * 2.0 * Math.PI / this.width;
            dy = this.options.rotateSpeed * dy * 2.0 * Math.PI / this.height;
            var cross = this.options.upVector.cross(this.transformInterface.direction);

            var mx = XML3D.Quat.fromAxisAngle(this.options.upVector, dx);
            var my = XML3D.Quat.fromAxisAngle(cross, dy);

            this.transformInterface.lookAround(mx, my, this.options.upVector);
        }
    };
    
    XML3D.StandardCamera.prototype.PANNING = {
        start: function (x, y) {
            var ray = this.xml3d.generateRay(x, y);
            this.state.dragPoint = this.intersectScene(ray);
        },
        move: function (x, y, dx, dy) {
            if (!this.state.dragPoint) return;
            
            var ray = this.xml3d.generateRay(x, y);
            var hitpoint = this.intersect_ray_plane(ray, XML3D.Vec3.fromValues(0.0, 1.0, 0.0), this.state.dragPoint);
            if (!hitpoint) return;
            
            var diff = this.state.dragPoint.subtract(hitpoint);
            if (isNaN(XML3D.math.vec3.sqrLen(diff.data))) return;
            
            this.transformInterface.translate(diff);
        }
    };
    
    XML3D.StandardCamera.prototype.ORBIT = {
        start: function (x, y) {
            if (!this.options.updateExaminePoint) return;
            var ray = this.xml3d.generateRay(x, y);
            this.state.examinePoint = this.intersectScene(ray);
        },
        move: function (x, y, dx, dy) {
            if (!this.state.examinePoint) return;
            
            var tf = this.transformInterface;
            
            dx = -this.options.rotateSpeed * dx * 2.0 * Math.PI / this.width;
            dy = -this.options.rotateSpeed * dy * 2.0 * Math.PI / this.height;
            
            var mx = new XML3D.Quat.fromAxisAngle([0,1,0], dx);
            var my = new XML3D.Quat.fromAxisAngle(new XML3D.Vec3.fromValues(1,0,0).transformQuat(mx.multiply(tf.orientation)), dy);
            
            var q0 = my.multiply(mx);
            
            var tmp = q0.multiply(tf.orientation);
            tmp.normalize();
            var rotated_dir = new XML3D.Vec3.fromValues(0,0,1).transformQuat(tmp);
            
            if (rotated_dir.y > 0.05 && rotated_dir.y < 0.95) {
                
                var diff = tf.position.subtract(this.state.examinePoint);
                var rotated = diff.transformQuat(q0);
                if (this.state.examinePoint.add(rotated).y > 5) {
                    tf.orientation = tmp;
                    tf.position = this.state.examinePoint.add(rotated);
                } else {
                    rotated = diff.transformQuat(mx);
                    tf.orientation = mx.multiply(tf.orientation);
                    tf.position = this.state.examinePoint.add(rotated);
                }
                
            } else {
                
                var diff = tf.position.subtract(this.state.examinePoint);
                var rotated = diff.transformQuat(mx);
                tf.orientation = mx.multiply(tf.orientation);
                tf.position = this.state.examinePoint.add(rotated);
                
            }
        }
    };
    
    
    XML3D.StandardCamera.prototype.intersectScene = function(ray) {
        if (this.options.dragging) {
            var hitpoint = new XML3D.Vec3();
            this.xml3d.getElementByRay(ray, hitpoint);
            if (!isNaN(XML3D.math.vec3.sqrLen(hitpoint.data)))
                return hitpoint;
        }
        
        return this.intersect_xz_plane(ray);
    }
    
    XML3D.StandardCamera.prototype.MODES = {};
    
    XML3D.StandardCamera.prototype.MODES.examine = {
        mouse: [
            XML3D.StandardCamera.prototype.ROTATE,
            XML3D.StandardCamera.prototype.TRANSLATE,
            XML3D.StandardCamera.prototype.DOLLY
        ],
        touch: [
            XML3D.StandardCamera.prototype.ROTATE,
            XML3D.StandardCamera.prototype.NO_ACTION, // XML3D.StandardCamera.prototype.DOLLY,
            XML3D.StandardCamera.prototype.NO_ACTION // XML3D.StandardCamera.prototype.TRANSLATE
        ]
    };
    
    XML3D.StandardCamera.prototype.MODES.panning = {
        mouse: [
            XML3D.StandardCamera.prototype.PANNING,
            XML3D.StandardCamera.prototype.DOLLY,
            XML3D.StandardCamera.prototype.ORBIT
        ],
        touch: [
            XML3D.StandardCamera.prototype.PANNING,
            XML3D.StandardCamera.prototype.NO_ACTION, // XML3D.StandardCamera.prototype.ORBIT,
            XML3D.StandardCamera.prototype.NO_ACTION // XML3D.StandardCamera.prototype.DOLLY
        ]
    };
    
    XML3D.StandardCamera.prototype.MODES.lookaround = {
        mouse: [
            XML3D.StandardCamera.prototype.LOOKAROUND,
            XML3D.StandardCamera.prototype.TRANSLATE,
            XML3D.StandardCamera.prototype.DOLLY
        ],
        touch: [
            XML3D.StandardCamera.prototype.LOOKAROUND,
            XML3D.StandardCamera.prototype.NO_ACTION, // XML3D.StandardCamera.prototype.DOLLY,
            XML3D.StandardCamera.prototype.NO_ACTION // XML3D.StandardCamera.prototype.TRANSLATE
        ]
    };
    
    XML3D.StandardCamera.prototype.mousePressEvent = function(event) {
        var ev = event || window.event;
        
        this.action = this.mode.mouse[ev.button];
        if (!this.action) return;
        
        var start = this.action.start;
        if (start) start.call(this, ev.pageX, ev.pageY);
        
        this.prevPos.x = ev.pageX;
        this.prevPos.y = ev.pageY;
        
        if (this.action !== this.NO_ACTION) {
            //Disable object picking during camera actions
            this.mousemovePicking = XML3D.options.getValue("renderer-mousemove-picking");
            XML3D.options.setValue("renderer-mousemove-picking", false);
        }
        
        this.stopEvent(event);
        return false;
    };
    
    XML3D.StandardCamera.prototype.mouseReleaseEvent = function (event) {
        var ev = event || window.event;
        if (!this.action) return;

        XML3D.options.setValue("renderer-mousemove-picking", this.mousemovePicking);
        
        var end = this.action.end;
        if (end) end.call(this, ev.pageX, ev.pageY);
        
        this.action = this.NO_ACTION;
        
        this.stopEvent(event);
        return false;
    };
    
    XML3D.StandardCamera.prototype.mouseMoveEvent = function (event, camera) {
        var ev = event || window.event;
        if (!this.action) return;
        
        var dx = ev.pageX - this.prevPos.x;
        var dy = ev.pageY - this.prevPos.y;
        
        var move = this.action.move;
        if (move) move.call(this, ev.pageX, ev.pageY, dx, dy);
        
        this.prevPos.x = ev.pageX;
        this.prevPos.y = ev.pageY;
        
        this.stopEvent(event);
        return false;
    };
    
    XML3D.StandardCamera.prototype.intersect_xz_plane = function (ray) {
        //specialized code for xz_plane is faster than code for general plane!
        //alternatively usable:
        //return intersect_ray_plane(vector, origin, new window.XML3DVec3(0,1,0), new window.XML3DVec3(0,0,0));
        if (ray.direction.y == 0 && ray.origin.y == 0)
            return ray.origin;
        
        if (ray.direction.y >= 0 || ray.origin.y <= 0) 
            return;
        
        var t = -(ray.origin.y / ray.direction.y);
        return ray.origin.add(ray.direction.scale(t));
    }
    
    XML3D.StandardCamera.prototype.intersect_ray_plane = function (ray, plane_normal, plane_origin) {
        var divisor = ray.direction.dot(plane_normal);
        var factor = (plane_origin.subtract(ray.origin)).dot(plane_normal);
        if (divisor == 0) {
            if (factor == 0)
                return ray.origin;
            return;
        }
        
        var d = factor / divisor;
        if (d < 0) return;
        
        return ray.origin.add(ray.direction.scale(d));
    }
    
    
    // -----------------------------------------------------
    // touch rotation and movement
    // -----------------------------------------------------
    
    XML3D.StandardCamera.prototype.touchStartEvent = function(event) {
        if (event.target.nodeName.toLowerCase() == "xml3d")
            this.stopEvent(event);
        
        var ev = event || window.event;
        
        this.action = this.mode.touch[ev.touches.length-1];
        if (!this.action) {
            this.action = this.NO_ACTION;
            return false;
        }
        
        var touchPositions = [];
        for (var i = 0; i < ev.touches.length; i++)
            touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};

        var start = this.action.start;
        if (start) start.call(this, touchPositions[0].x, touchPositions[0].y);
        
        this.prevTouchPositions = touchPositions;
        
        return false;
    };
    
    XML3D.StandardCamera.prototype.touchEndEvent = function(event) {
        if (event.target.nodeName.toLowerCase() == "xml3d")
            this.stopEvent(event);
        
        var ev = event || window.event;
        
        if (!this.action)
            return false;
        
        var touchPositions = [];
        for (var i=0; i<ev.touches.length; i++)
            touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        
        var end = this.action.end;
        if (end) end.call(this, touchPositions[0].x, touchPositions[0].y);
        
        this.action = this.NO_ACTION;
        
        return false;
    };
    
    XML3D.StandardCamera.prototype.touchMoveEvent = function(event, camera) {
        if (event.target.nodeName.toLowerCase() == "xml3d")
            this.stopEvent(event);
        
        var ev = event || window.event;
        if (!this.action)
            return;
        
        var touchPositions = [];
        for (var i = 0; i < ev.touches.length; i++)
            touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        
        var dx = touchPositions[0].x - this.prevTouchPositions[0].x;
        var dy = touchPositions[0].y - this.prevTouchPositions[0].y;
        
        var move = this.action.move;
        if (move) move.call(this, touchPositions[0].x, touchPositions[0].y, dx, dy);
        
        // var f, dx, dy, dv, trans, mx, my;
        // switch(this.action) {
            // case(this.TRANSLATE):
                // if (this.touchTranslateMode == "threefinger") {
                    // f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                    // dx = f*(ev.touches[0].pageX - this.prevTouchPositions[0].x);
                    // dy = f*(ev.touches[0].pageY - this.prevTouchPositions[0].y);
                    // trans = XML3D.Vec3.fromValues(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                    // this.transformInterface.translate(this.transformInterface.inverseTransformOf(trans));
                // }
                // break;
            // case(this.DOLLY):
                // if (this.touchTranslateMode == "twofinger") {
                    // apple-style 2-finger dolly + translate
                    // var prevMidpoint;

                    // if (this.prevTouchPositions.length > 1) {
                        // prevMidpoint = {x:(this.prevTouchPositions[0].x + this.prevTouchPositions[1].x) / 2 ,
                                        // y:(this.prevTouchPositions[0].y + this.prevTouchPositions[1].y) / 2 }
                    // }

                    // if (prevMidpoint !== undefined) {
                        // var curMidpoint = {x:(ev.touches[0].pageX + ev.touches[1].pageX) / 2 ,
                                           // y:(ev.touches[0].pageY + ev.touches[1].pageY) / 2 };
                        // f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                        // dx = f*(curMidpoint.x - prevMidpoint.x);
                        // dy = f*(curMidpoint.y - prevMidpoint.y);
                        // trans = XML3D.Vec3.fromValues(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                        // this.transformInterface.translate(this.transformInterface.inverseTransformOf(trans));
                    // }
                // }

                // if (this.prevZoomVectorLength !== null) {
                    // dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    // var currLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);

                    // dy = this.zoomSpeed * (currLength - this.prevZoomVectorLength) / this.height;
                    // this.transformInterface.translate(this.transformInterface.inverseTransformOf(XML3D.Vec3.fromValues(0, 0, -dy)));

                    // this.prevZoomVectorLength = currLength;
                // } else {
                    // dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    // this.prevZoomVectorLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);
                // }

                // break;
            // case(this.ORBIT): //new code to handle orbit update, rotate around the first touch-point
                // var new_vector = this.getDirectionThroughPixel(ev.touches[0].pageX, ev.touches[0].pageY);
                
                // if (this.useRaycasting) {
                    // var new_ray = new window.XML3DRay(this.camera.position, new_vector);
                    // var new_hitpoint = new this.xml3d.createXML3DVec3();
                    // var new_hitnormal = new this.xml3d.createXML3DVec3();
                    // this.xml3d.getElementByRay(new_ray, new_hitpoint, new_hitnormal);
                    // var new_intersection = new_hitpoint;
                // } else {
                    // var new_intersection = intersect_xz_plane(new_vector, this.camera.position);
                // }
                
                // if (new_intersection != undefined) {
                
                    // var dx = -this.rotateSpeed * (ev.touches[1].pageX - this.prevTouchPositions[1].x) * 2.0 * Math.PI / this.camera.width;
                    // var dy = -this.rotateSpeed * (ev.touches[1].pageY - this.prevTouchPositions[1].y) * 2.0 * Math.PI / this.camera.height;

                    // var mx = new window.XML3DRotation(new window.XML3DVec3(0,1,0), dx);
                    // var my = new window.XML3DRotation((mx.multiply(this.camera.orientation)).rotateVec3(new window.XML3DVec3(1,0,0)), dy);
                    
                    // var q0 = my.multiply(mx);

                    // var p0 = new_intersection;
                    // var tmp = q0.multiply(this.camera.orientation);
                    // tmp.normalize();
                    // var rotated_dir = tmp.rotateVec3(new window.XML3DVec3(0,0,1));
                    
                    // if (rotated_dir.y > 0.05 && rotated_dir.y < 0.95) {
                        
                        // var diff = this.camera.position.subtract(new_intersection);
                        // var rotated = q0.rotateVec3(diff);
                        // if (p0.add(rotated).y > 5) {
                            // this.camera.orientation = tmp;
                            // this.camera.position = p0.add(rotated);
                        // } else {
                            // rotated = mx.rotateVec3(diff);
                            // this.camera.orientation = mx.multiply(this.camera.orientation);
                            // this.camera.position = p0.add(rotated);
                        // }
                        
                    // } else {
                    
                        // var diff = this.camera.position.subtract(new_intersection);
                        // var rotated = mx.rotateVec3(diff);
                        // this.camera.orientation = mx.multiply(this.camera.orientation);
                        // this.camera.position = p0.add(rotated);
                    
                    // }
                
                // }
                // break;
            
        // }

        if (this.action != this.NO_ACTION) {
            
            this.prevTouchPositions = touchPositions;
            event.returnValue = false;
        }

        return false;
    };


    // -----------------------------------------------------
    // key movement
    // -----------------------------------------------------

    XML3D.StandardCamera.prototype.keyHandling = function(e) {
        this.stopEvent(e);

        var KeyID = e.keyCode;
        if (KeyID == 0) {
            switch (e.which) {
            case 119:
                KeyID = 87;
                break; // w
            case 100:
                KeyID = 68;
                break; // d
            case 97:
                KeyID = 65;
                break; // a
            case 115:
                KeyID = 83;
                break; // s
            }
        }

        var dir = this.transformInterface.direction;
        var right = this.transformInterface.rightVector;
        var np;
        
        switch (KeyID) {
            case 38: // up
            case 87: // w
                np = dir;
                break;
            case 39: // right
            case 68: // d
                np = right;
                break;
            case 37: // left
            case 65: // a
                np = right.scale(-1);
                break;
            case 40: // down
            case 83: // s
                np = dir.scale(-1);
                break;
            
            default:
                return;
        }
        this.transformInterface.translate(np.scale(this.options.moveSpeed));
    };


    var TransformInterface = function(element, xml3d) {
        this.element = element;
        this.xml3d = xml3d;
        this.transform = this.getTransformForElement(element);
    };

    TransformInterface.prototype.getTransformForElement = function(element) {
        if (element.hasAttribute("transform")) {
            //If the element already has a transform we can reuse that
            return document.querySelector(element.getAttribute("transform"));
        }
        return this.createTransformForView(element);
    };

    TransformInterface.prototype.createTransformForView = (function() {
        var elementCount = 0;
        return function(element) {
            var transform = document.createElement("transform");
            var tid = "Generated_Camera_Transform_" + elementCount++;
            transform.setAttribute("id", tid);
            element.parentElement.appendChild(transform);
            element.setAttribute("transform", "#"+tid);
            return transform;
        }
    })();

    TransformInterface.prototype.__defineGetter__("orientation", function() {
        return XML3D.Quat.fromAxisAngle(this.transform.rotation);
    });
    TransformInterface.prototype.__defineGetter__("position", function() {
        return this.transform.translation;
    });
    TransformInterface.prototype.__defineSetter__("orientation", function(orientation) {
        var aa = XML3D.AxisAngle.fromQuat(orientation);
        this.transform.setAttribute("rotation", aa.toDOMString());
    });
    TransformInterface.prototype.__defineSetter__("position", function(position) {
        this.transform.setAttribute("translation", position.toDOMString());
    });
    TransformInterface.prototype.__defineGetter__("direction", function() {
        var dir = new XML3D.Vec3.fromValues(0, 0, -1);
        return dir.transformQuat(this.orientation);
    });
    TransformInterface.prototype.__defineGetter__("upVector", function() {
        var up = new XML3D.Vec3.fromValues(0, 1, 0);
        return up.transformQuat(this.orientation);
    });
    TransformInterface.prototype.__defineGetter__("rightVector", function() {
        var right = new XML3D.Vec3.fromValues(1, 0, 0);
        return right.transformQuat(this.orientation);
    });
    TransformInterface.prototype.__defineGetter__("fieldOfView", function() {
        var fovh = this.element.querySelector("float[name=fovHorizontal]");
        if (fovh) {
            var h = fovh.getValue();
            return 2 * Math.atan(Math.tan(h / 2.0) * this.xml3d.width / this.xml3d.height);
        }
        var fovv = this.element.querySelector("float[name=fovVertical]");
        if (fovv) {
            return fovv.getValue();
        }
        return (45 * Math.PI / 180); //Default FOV
    });

    TransformInterface.prototype.rotateAroundPoint = (function() {
        var tmpQuat = new XML3D.Quat();

        return function(q0, p0) {
            this.orientation = this.orientation.mul(q0).normalize();
            var aa = XML3D.AxisAngle.fromQuat(q0);
            var axis = this.inverseTransformOf(aa.axis);
            tmpQuat = XML3D.Quat.fromAxisAngle(axis, aa.angle);
            this.position = this.position.subtract(p0).transformQuat(tmpQuat).add(p0);
        }
    })();

    TransformInterface.prototype.lookAround = function(rotSide, rotUp, upVector) {
        var check = rotUp.mul(this.orientation);

        var tmp = XML3D.Vec3.fromValues(0,0,-1).transformQuat(check);
        var rot = rotSide.clone();
        if (Math.abs(upVector.dot(tmp)) <= 0.95) {
            rot = rot.mul(rotUp);
        }

        rot = rot.normalize().mul(this.orientation).normalize();
        this.orientation = rot;
    };

    TransformInterface.prototype.rotate = function(q0) {
        this.orientation = this.orientation.mul(q0).normalize();
    };

    TransformInterface.prototype.translate = function(t0) {
        this.position = this.position.add(t0);
    };

    TransformInterface.prototype.inverseTransformOf = function(vec) {
        return vec.transformQuat(this.orientation);
    };

    TransformInterface.prototype.lookAt = function(point) {
        var dir = point.sub(this.position).normalize();
        var up = XML3D.Vec3.fromValues(0,1,0);
        var orientation = this.orientation;
        var basisX = new XML3D.Vec3(dir).cross(up);
        if (!basisX.length()) {
            basisX = XML3D.Vec3.fromValues(1,0,0).transformQuat(orientation);
        }
        var basisY = basisX.clone().cross(dir);
        var basisZ = new XML3D.Vec3(dir).negate();
        this.orientation = XML3D.Quat.fromBasis(basisX, basisY, basisZ);
    };
})();
