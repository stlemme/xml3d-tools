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

        this.mode = opt.mode || "examine";
        this.touchTranslateMode = opt.touchTranslateMode || "twofinger";
        //Note: The examine point is relative to the element's parent coordinate space.
        this.examinePoint = opt.examinePoint || this.getInverseTranslationOfParent(element);
        this.rotateSpeed = opt.rotateSpeed || 3;
        this.zoomSpeed = opt.zoomSpeed || 20;
        this.useKeys = opt.useKeys !== undefined ? opt.useKeys : false;
        this.useRaycasting = opt.useRaycasting !== undefined ? opt.useRaycasting : true;
        this.mousemovePicking = true;

        this.transformInterface = new TransformInterface(this.element, this.xml3d);
        this.prevPos = {x: -1, y: -1};
        this.prevTouchPositions = [];
        this.prevTouchPositions[0] = {
            x : -1,
            y : -1
        };
        this.prevZoomVectorLength = null;
        this.upVector = this.transformInterface.upVector;

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
        this.examinePoint = bb.center();
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
        if (this.useKeys)
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
        if (this.useKeys)
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
	
	XML3D.StandardCamera.prototype.getRayDirection = function(x, y) {
		// x and y are ratios relative to to dir
		var orientation = this.transformInterface.orientation;
		
		var dir = XML3D.Vec3.fromValues(0, 0, -1).transformQuat(orientation);
		var span_x = XML3D.Vec3.fromValues(x, 0, 0).transformQuat(orientation);
		var span_y = XML3D.Vec3.fromValues(0, -y, 0).transformQuat(orientation);
				
		return dir.add(span_x).add(span_y);
	};
	
	XML3D.StandardCamera.prototype.getDirectionThroughPixel = function(x, y) {
		var ratio = Math.tan(0.5 * this.transformInterface.fieldOfView);
		//calculate length of spanning vectors in x and y direction
		var x_span = (x - this.width / 2) * 2 / this.height * ratio;
		var y_span = (y - this.height / 2) * 2 / this.height * ratio;
		
		//calculate ray directions through camera
		return this.getRayDirection(x_span, y_span);
	}

    XML3D.StandardCamera.prototype.NO_MOUSE_ACTION = "no_action";
    XML3D.StandardCamera.prototype.TRANSLATE = "translate";
    XML3D.StandardCamera.prototype.DOLLY = "dolly";
    XML3D.StandardCamera.prototype.ROTATE = "rotate";
    XML3D.StandardCamera.prototype.LOOKAROUND = "lookaround";
	XML3D.StandardCamera.prototype.PANNING = "panning";
	XML3D.StandardCamera.prototype.ORBIT = "orbit";

    XML3D.StandardCamera.prototype.intersectScene = function(pos, dir) {
		if (this.useRaycasting) {
			var ray = new XML3D.Ray().setFromOriginDirection(pos, dir);
			var hitpoint = new XML3D.Vec3();
			this.xml3d.getElementByRay(ray, hitpoint);
			if (!isNaN(XML3D.math.vec3.sqrLen(hitpoint.data)))
				return hitpoint;
		}
		
		return intersect_xz_plane(dir, pos);
	}

    XML3D.StandardCamera.prototype.mousePressEvent = function(event) {
        var ev = event || window.event;

        switch (ev.button) {
            case 0:
                if (this.mode == "examine")
                    this.action = this.ROTATE;
				
				else if (this.mode == "panning") {
					this.action = this.PANNING;
					var dir = this.getDirectionThroughPixel(ev.pageX, ev.pageY);
					this.dragPoint = this.intersectScene(this.transformInterface.position, dir);

				} else
                    this.action = this.LOOKAROUND;
                break;
            case 1:
				if (this.mode == "panning")
					this.action = this.DOLLY
				else
					this.action = this.TRANSLATE;
                break;
            case 2:
				if (this.mode == "panning") {
					this.action = this.ORBIT;
					var dir = this.getDirectionThroughPixel(ev.pageX, ev.pageY);
					this.rotationCenter = this.intersectScene(this.transformInterface.position, dir);

				} else {
					this.action = this.DOLLY;
				}
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        this.prevPos.x = ev.pageX;
        this.prevPos.y = ev.pageY;

        if (this.action !== this.NO_MOUSE_ACTION) {
            //Disable object picking during camera actions
            this.mousemovePicking = XML3D.options.getValue("renderer-mousemove-picking");
            XML3D.options.setValue("renderer-mousemove-picking", false);
        }

        this.stopEvent(event);
        return false;
    };

    XML3D.StandardCamera.prototype.mouseReleaseEvent = function(event) {
        this.stopEvent(event);

        if (this.action !== this.NO_MOUSE_ACTION) {
            XML3D.options.setValue("renderer-mousemove-picking", this.mousemovePicking);
        }

        this.action = this.NO_MOUSE_ACTION;
        return false;
    };

    XML3D.StandardCamera.prototype.mouseMoveEvent = function(event, camera) {
        var ev = event || window.event;
        if (!this.action)
            return;
        var dx, dy, mx, my;
        switch(this.action) {
            case(this.TRANSLATE):
                var f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                dx = f*(ev.pageX - this.prevPos.x) * this.zoomSpeed;
                dy = f*(ev.pageY - this.prevPos.y) * this.zoomSpeed;
                var trans = XML3D.Vec3.fromValues(-dx, dy, 0.0);
                this.transformInterface.translate(this.transformInterface.inverseTransformOf(trans));
                break;
            case(this.DOLLY):
                dy = this.zoomSpeed * (ev.pageY - this.prevPos.y) / this.height;
                this.transformInterface.translate(this.transformInterface.inverseTransformOf(XML3D.Vec3.fromValues(0, 0, dy)));
                break;
            case(this.ROTATE):
                dx = -this.rotateSpeed*0.1 * (ev.pageX - this.prevPos.x) * 2.0 * Math.PI / this.width;
                dy = -this.rotateSpeed*0.1 * (ev.pageY - this.prevPos.y) * 2.0 * Math.PI / this.height;

                mx = XML3D.Quat.fromAxisAngle([0,1,0], dx);
                my = XML3D.Quat.fromAxisAngle([1,0,0], dy);
                mx = mx.mul(my);
                this.transformInterface.rotateAroundPoint(mx, this.examinePoint);
                break;
            case(this.LOOKAROUND):
                dx = -this.rotateSpeed*0.1 * (ev.pageX - this.prevPos.x) * 2.0 * Math.PI / this.width;
                dy = this.rotateSpeed*0.1 * (ev.pageY - this.prevPos.y) * 2.0 * Math.PI / this.height;
                var cross = this.upVector.cross(this.transformInterface.direction);

                mx = XML3D.Quat.fromAxisAngle( this.upVector , dx);
                my = XML3D.Quat.fromAxisAngle( cross , dy);

                this.transformInterface.lookAround(mx, my, this.upVector);
                break;
				
			case(this.PANNING): //new code to handle panning update
				if (!this.dragPoint) break;

				var ray = this.getDirectionThroughPixel(ev.pageX, ev.pageY);
				var hitpoint = intersect_ray_plane(ray, this.transformInterface.position, XML3D.Vec3.fromValues(0.0, 1.0, 0.0), this.dragPoint);
				//var hitpoint = intersect_ray_plane(ray, this.transformInterface.position, this.transformInterface.direction, this.dragPoint);
				if (!hitpoint) break;
				
				var diff = this.dragPoint.subtract(hitpoint);
				if (isNaN(XML3D.math.vec3.sqrLen(diff.data))) break;
				
				this.translate(diff);
				break;
			
			case(this.ORBIT): //new code to handle panning update
				
				if (!this.rotationCenter) break;
					
				var tf = this.transformInterface;
			
				var dx = -this.rotateSpeed * (ev.pageX - this.prevPos.x) * 2.0 * Math.PI / this.width;
				var dy = -this.rotateSpeed * (ev.pageY - this.prevPos.y) * 2.0 * Math.PI / this.height;

				var mx = new XML3D.Quat.fromAxisAngle(new XML3D.Vec3.fromValues(0,1,0), dx);
				var my = new XML3D.Quat.fromAxisAngle(new XML3D.Vec3.fromValues(1,0,0).transformQuat(mx.multiply(tf.orientation)), dy);
				
				var q0 = my.multiply(mx);

				var tmp = q0.multiply(tf.orientation);
				tmp.normalize();
				var rotated_dir = new XML3D.Vec3.fromValues(0,0,1).transformQuat(tmp);
				
				if (rotated_dir.y > 0.05 && rotated_dir.y < 0.95) {
					
					var diff = tf.position.subtract(this.rotationCenter);
					var rotated = diff.transformQuat(q0);
					if (this.rotationCenter.add(rotated).y > 5) {
						tf.orientation = tmp;
						tf.position = this.rotationCenter.add(rotated);
					} else {
						rotated = diff.transformQuat(mx);
						tf.orientation = mx.multiply(tf.orientation);
						tf.position = this.rotationCenter.add(rotated);
					}
					
				} else {
					
					var diff = tf.position.subtract(this.rotationCenter);
					var rotated = diff.transformQuat(mx);
					tf.orientation = mx.multiply(tf.orientation);
					tf.position = this.rotationCenter.add(rotated);
				
				}
				
				break;
        }

        if (this.action != this.NO_MOUSE_ACTION)
        {
            this.prevPos.x = ev.pageX;
            this.prevPos.y = ev.pageY;
            event.returnValue = false;
        }
        this.stopEvent(event);
        return false;
    };

	function intersect_xz_plane(vector, origin) {
		//specialized code for xz_plane is faster than code for general plane!
		//alternatively usable:
		//return intersect_ray_plane(vector, origin, new window.XML3DVec3(0,1,0), new window.XML3DVec3(0,0,0));
		if (vector.y == 0 && origin.y == 0)
			return origin;

		if (vector.y >= 0 || origin.y <= 0) 
			return;
		
		var t = -(origin.y / vector.y);
		var projected = origin.add(vector.scale(t));
		return projected;
	}

	function intersect_ray_plane(ray_direction, ray_origin, plane_normal, plane_origin) {
		var divisor = ray_direction.dot(plane_normal);
		var factor = (plane_origin.subtract(ray_origin)).dot(plane_normal);
		if (divisor == 0) {
			if (factor == 0)
				return ray_origin;
			return;
		}
		
		var d = factor / divisor;
		if (d < 0)
			return;
		
		var point = ray_origin.add(ray_direction.scale(d));
		return point;
	}
	

    // -----------------------------------------------------
    // touch rotation and movement
    // -----------------------------------------------------

    XML3D.StandardCamera.prototype.touchStartEvent = function(event) {
        if (event.target.nodeName.toLowerCase() == "xml3d") {
            this.stopEvent(event);
        }

        var ev = event || window.event;
        switch (ev.touches.length) {
            case 1:
                if (this.mode == "examine")
                    this.action = this.ROTATE;
				else if (this.mode == "panning")
					this.action = this.PANNING;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 2:
				if (this.mode == "panning")
					this.action = this.ORBIT;
				else
					this.action = this.DOLLY;
                break;
            case 3:
				if (this.mode == "panning")
					this.action = this.DOLLY;
				else
					this.action = this.TRANSLATE;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        var touchPositions = [];
        for (var i=0; i<ev.touches.length; i++) {
                touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        }
        this.prevTouchPositions = touchPositions;

        return false;
    };

    XML3D.StandardCamera.prototype.touchEndEvent = function(event) {
        if (event.target.nodeName.toLowerCase() == "xml3d") {
            this.stopEvent(event);
        }

        var ev = event || window.event;
        switch (ev.touches.length) {
            case 1:
                this.prevZoomVectorLength = null;
                if (this.mode == "examine")
                    this.action = this.ROTATE;
				else if (this.mode == "panning")
					this.action = this.PANNING;
                else
                    this.action = this.LOOKAROUND;
                break;
            case 2:
				if(this.mode == "panning")
					this.action = this.ORBIT;
				else
					this.action = this.DOLLY;
                break;
            case 3:
				if (this.mode == "panning")
					this.action = this.DOLLY;
				else
					this.action = this.TRANSLATE;
                break;
            default:
                this.action = this.NO_MOUSE_ACTION;
        }

        var touchPositions = [];
        for (var i=0; i<ev.touches.length; i++) {
                touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
        }
        this.prevTouchPositions = touchPositions;

        return false;
    };

    XML3D.StandardCamera.prototype.touchMoveEvent = function(event, camera) {
        if (event.target.nodeName.toLowerCase() == "xml3d") {
            this.stopEvent(event);
        }

        var ev = event || window.event;
        if (!this.action)
            return;
        var f, dx, dy, dv, trans, mx, my;
        switch(this.action) {
            case(this.TRANSLATE):
                if (this.touchTranslateMode == "threefinger") {
                    f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                    dx = f*(ev.touches[0].pageX - this.prevTouchPositions[0].x);
                    dy = f*(ev.touches[0].pageY - this.prevTouchPositions[0].y);
                    trans = XML3D.Vec3.fromValues(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                    this.transformInterface.translate(this.transformInterface.inverseTransformOf(trans));
                }
                break;
            case(this.DOLLY):
                if (this.touchTranslateMode == "twofinger") {
                    //apple-style 2-finger dolly + translate
                    var prevMidpoint;

                    if (this.prevTouchPositions.length > 1) {
                        prevMidpoint = {x:(this.prevTouchPositions[0].x + this.prevTouchPositions[1].x) / 2 ,
                                        y:(this.prevTouchPositions[0].y + this.prevTouchPositions[1].y) / 2 }
                    }

                    if (prevMidpoint !== undefined) {
                        var curMidpoint = {x:(ev.touches[0].pageX + ev.touches[1].pageX) / 2 ,
                                           y:(ev.touches[0].pageY + ev.touches[1].pageY) / 2 };
                        f = 2.0* Math.tan(this.transformInterface.fieldOfView/2.0) / this.height;
                        dx = f*(curMidpoint.x - prevMidpoint.x);
                        dy = f*(curMidpoint.y - prevMidpoint.y);
                        trans = XML3D.Vec3.fromValues(-dx*this.zoomSpeed, dy*this.zoomSpeed, 0.0);
                        this.transformInterface.translate(this.transformInterface.inverseTransformOf(trans));
                    }
                }

                if (this.prevZoomVectorLength !== null) {
                    dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    var currLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);

                    dy = this.zoomSpeed * (currLength - this.prevZoomVectorLength) / this.height;
                    this.transformInterface.translate(this.transformInterface.inverseTransformOf(XML3D.Vec3.fromValues(0, 0, -dy)));

                    this.prevZoomVectorLength = currLength;
                } else {
                    dv = {x: ev.touches[0].pageX - ev.touches[1].pageX, y: ev.touches[0].pageY - ev.touches[1].pageY};
                    this.prevZoomVectorLength = Math.sqrt(dv.x*dv.x + dv.y*dv.y);
                }

                break;
            case(this.ROTATE):
                dx = -this.rotateSpeed*0.1 * (ev.touches[0].pageX - this.prevTouchPositions[0].x) * 2.0 * Math.PI / this.width;
                dy = -this.rotateSpeed*0.1 * (ev.touches[0].pageY - this.prevTouchPositions[0].y) * 2.0 * Math.PI / this.height;

                mx = XML3D.Quat.fromAxisAngle([0,1,0], dx);
                my = XML3D.Quat.fromAxisAngle([1,0,0], dy);
                mx = mx.mul(my);
                this.transformInterface.rotateAroundPoint(mx, this.examinePoint);
                break;
            case(this.LOOKAROUND):
                dx = -this.rotateSpeed*0.1 * (ev.touches[0].pageX - this.prevTouchPositions[0].x) * 2.0 * Math.PI / this.width;
                dy = this.rotateSpeed*0.1 * (ev.touches[0].pageY - this.prevTouchPositions[0].y) * 2.0 * Math.PI / this.height;
                var cross = this.upVector.cross(this.transformInterface.direction);

                mx = XML3D.Quat.fromAxisAngle( this.upVector , dx);
                my = XML3D.Quat.fromAxisAngle( cross , dy);

                this.transformInterface.lookAround(mx, my, this.upVector);
                break;
			
			case(this.PANNING): //new code to handle panning update
				var new_vector = this.getDirectionThroughPixel(ev.touches[0].pageX, ev.touches[0].pageY);
				var old_vector = this.getDirectionThroughPixel(this.prevTouchPositions[0].x, this.prevTouchPositions[0].y);
				
				if (this.useRaycasting) {
					var old_ray = new window.XML3DRay(this.camera.position, old_vector);
					var old_hitpoint = new this.xml3d.createXML3DVec3();
					var old_hitnormal = new this.xml3d.createXML3DVec3();
					this.xml3d.getElementByRay(old_ray, old_hitpoint, old_hitnormal);
				
					if (!(old_hitpoint === undefined)) {
						//intersect_ray_plane and old_hitpoint are slightly different, creating weird bugs when using old_hitpoint as old_intersection
						var old_intersection = intersect_ray_plane(old_vector, this.camera.position, new window.XML3DVec3(0.0,1.0,0.0), old_hitpoint);
						var new_intersection = intersect_ray_plane(new_vector, this.camera.position, new window.XML3DVec3(0.0,1.0,0.0), old_hitpoint);
					}
				} else {
					//calculate intersections of old and new ray with xz plane
					var old_intersection = intersect_xz_plane(old_vector, this.camera.position);
					var new_intersection = intersect_xz_plane(new_vector, this.camera.position);
				}
			
				//calculate difference vector and adjust camera position
				if (!(old_intersection === undefined || new_intersection === undefined)) {
					// can i project both vectors on the plane with positive t?
					var difference = old_intersection.subtract(new_intersection);
					if (difference.length() < 10000) {
						this.camera.translate(difference);
					}
				}
				break;
			
			case(this.ORBIT): //new code to handle orbit update, rotate around the first touch-point
				var new_vector = this.getDirectionThroughPixel(ev.touches[0].pageX, ev.touches[0].pageY);
				
				if (this.useRaycasting) {
					var new_ray = new window.XML3DRay(this.camera.position, new_vector);
					var new_hitpoint = new this.xml3d.createXML3DVec3();
					var new_hitnormal = new this.xml3d.createXML3DVec3();
					this.xml3d.getElementByRay(new_ray, new_hitpoint, new_hitnormal);
					var new_intersection = new_hitpoint;
				} else {
					var new_intersection = intersect_xz_plane(new_vector, this.camera.position);
				}
				
				if (new_intersection != undefined) {
				
					var dx = -this.rotateSpeed * (ev.touches[1].pageX - this.prevTouchPositions[1].x) * 2.0 * Math.PI / this.camera.width;
					var dy = -this.rotateSpeed * (ev.touches[1].pageY - this.prevTouchPositions[1].y) * 2.0 * Math.PI / this.camera.height;

					var mx = new window.XML3DRotation(new window.XML3DVec3(0,1,0), dx);
					var my = new window.XML3DRotation((mx.multiply(this.camera.orientation)).rotateVec3(new window.XML3DVec3(1,0,0)), dy);
					
					var q0 = my.multiply(mx);

					var p0 = new_intersection;
					var tmp = q0.multiply(this.camera.orientation);
					tmp.normalize();
					var rotated_dir = tmp.rotateVec3(new window.XML3DVec3(0,0,1));
					
					if (rotated_dir.y > 0.05 && rotated_dir.y < 0.95) {
						
						var diff = this.camera.position.subtract(new_intersection);
						var rotated = q0.rotateVec3(diff);
						if (p0.add(rotated).y > 5) {
							this.camera.orientation = tmp;
							this.camera.position = p0.add(rotated);
						} else {
							rotated = mx.rotateVec3(diff);
							this.camera.orientation = mx.multiply(this.camera.orientation);
							this.camera.position = p0.add(rotated);
						}
						
					} else {
					
						var diff = this.camera.position.subtract(new_intersection);
						var rotated = mx.rotateVec3(diff);
						this.camera.orientation = mx.multiply(this.camera.orientation);
						this.camera.position = p0.add(rotated);
					
					}
				
				}
				break;
			
        }

        if (this.action != this.NO_MOUSE_ACTION) {
            var touchPositions = [];
            for (var i=0; i<ev.touches.length; i++) {
                touchPositions[i] = {x: ev.touches[i].pageX, y: ev.touches[i].pageY};
            }
            this.prevTouchPositions = touchPositions;
            event.returnValue = false;
        }

        return false;
    };


    // -----------------------------------------------------
    // key movement
    // -----------------------------------------------------

    XML3D.StandardCamera.prototype.keyHandling = function(e) {
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

        var xml3d = this.xml3d;
        var element = this.transformInterface;
        var dir = element.direction;
        var np;
        if (xml3d) {
            switch (KeyID) {
            case 38: // up
            case 87: // w
                np = element.position;
                np.z += dir.z * this.zoomSpeed * 0.05;
                np.x += dir.x * this.zoomSpeed * 0.05;
                element.position = np;
                break;
            case 39: // right
            case 68: // d
                np = element.position;
                np.x -= dir.z * this.zoomSpeed * 0.05;
                np.z += dir.x * this.zoomSpeed * 0.05;
                element.position = np;
                break;
            case 37: // left
            case 65: // a
                np = element.position;
                np.x += dir.z * this.zoomSpeed * 0.05;
                np.z -= dir.x * this.zoomSpeed * 0.05;
                element.position = np;
                break;
            case 40: // down
            case 83: // s
                np = element.position;
                np.z -= dir.z * this.zoomSpeed * 0.05;
                np.x -= dir.x * this.zoomSpeed * 0.05;
                element.position = np;
                break;

            default:
                return;
            }
        }
        this.stopEvent(e);
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
