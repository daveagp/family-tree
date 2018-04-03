'use strict';

// Override these settings:
var familyDataFilename = "simpsons_family.txt"  // Your own family.txt
var defaultRootName = 'Leopold';                // Someone in your family
var lineHeight = 280;  // 220 is better, but the Simpsons pngs are very vertical

// Other rendering constants
var paddingAmount = 8;
var photoDir = 'photos/'; // should end with slash

// Rendering settings that user can change
var includeAll = false;
// 1: ancestors + siblings; 2: ancestor + cousins; Infinity: all blood relatives
var downLimit = Infinity;
var rootName = defaultRootName;

// Stateful global helpers
var imageTracker = {
    numCreated: 0,
    numDone: 0,
    allCreated: false};
var missingCount = 0; // to replace ? by unique identifiers
function newMissingLabel() {
    missingCount += 1;
    return '?#' + missingCount;
}

// Reads family_txt Name -> list of sublines e.g. ['c: blah', 'n: blah']
function readInput(text) {
    // Read input minus comments
    var lines = text.split('\n');

    var result = {};
    var i = 0;
    // skip line if comment or blank. return true iff it was a comment or blank.
    function trySkipComment() {
	if (i >= lines.length
	    || !(lines[i].startsWith('#') || lines[i].trim() == ""))
	    return false;
	i++;
	return true;
    }
    while (i < lines.length) {
	if (trySkipComment()) continue;
	var key = lines[i];
	var toks = key.split(' + ');
	if (toks.length > 2) {
	    throw "Multiple + signs in union: " + key;
	}
	toks = toks.map(x => x.trim());
	if (toks.includes(""))
	    throw "Misformatted line " + i + ": " + key;
        if (key.includes(","))
            throw "Names can't contain commas: " + key;
	if (toks.length == 2) {
	    // need to update name of union with ? so it can be referenced later
	    if (toks[0] == '?') toks[0] = newMissingLabel();
	    if (toks[1] == '?') toks[1] = newMissingLabel();
	    key = toks[0] + ' + ' + toks[1];
	} else {
            if (result.hasOwnProperty(key))
                throw "Multiple entries for name: " + key;
        }
	var value = [];
	i += 1;
	while (i < lines.length && lines[i].startsWith(' ')) {
	    if (trySkipComment()) continue;
	    let trimmedLine = lines[i].trim();
	    // should be "X: ..." where X is a limited set of characters
	    // n: note. l: lifespan. c: children. p: picture.
	    if (trimmedLine.substr(1, 2) != ": "
		|| isPerson(key) && !["n", "l", "p"].includes(trimmedLine[0])
		|| isUnion(key) && !["n", "c"].includes(trimmedLine[0])) {
		throw "Misformatted line under " + key + ": " + trimmedLine; 
	    }
	    value.push(trimmedLine);
	    i += 1;
	}
	result[key] = value;
    }
    return result;
}

function isPerson(name) {
    return name.indexOf(' + ') < 0;
}

function isUnion(name) {
    return name.indexOf(' + ') >= 0;
}

// Rewrite as undirected graph on people and unions
function getEdges(entries) {
    var result = [];
    for (var [name, props] of Object.entries(entries)) {
	if (isPerson(name)) continue;
	var [p1, p2] = name.split(' + ');
	if (p1=='?') p1 = newMissingLabel();
	if (p2=='?') p2 = newMissingLabel();
	var newName = p1 + ' + ' + p2;
	var children = [];
	for (var prop of props) {
	    if (prop.startsWith('c: '))
		children = prop.substring(3).split(', ');
	}
	for (var i=0; i<children.length; i++) {
	    if (children[i]=="?") {
		children[i] = newMissingLabel();
	    }
	}
	for (var x of children.concat([p1, p2]))
	    result.push([newName, x]);
    }
    return result;
}

// returns map from person/union -> list of person/unions
function getNeighbours(edges) {
    var result = {};
    for (var [u, v] of edges) {
	if (!result.hasOwnProperty(u)) result[u] = [];
	if (!result.hasOwnProperty(v)) result[v] = [];
	result[u].push(v);
	result[v].push(u);
    }
    return result;
}

function getUnion(person, neighbours, side) {
    var result = [];
    for (name of neighbours[person]) {
	var members = name.split(' + ');
	if (members[1 - side]==person) result.push(name);
    }
    if (result.length==0) return null;
    else if (result.length==1) return result[0];
    else throw (person + ' has two unions on side ' + side);
}

function getLeftUnion(person, neighbours) {
    return getUnion(person, neighbours, 0);
}

function getRightUnion(person, neighbours) {
    return getUnion(person, neighbours, 1);
}

function getAboveUnion(person, neighbours) {
    for (name of neighbours[person]) {
	if ((name.split(' + ').indexOf(person)) == -1)
	    return name;
    }
    return null;
}

function getChildren(union, neighbours) {
    if (union==null) return [];
    return neighbours[union].filter(
	name => union.split(' + ').indexOf(name) == -1);
}

// updates layout in-place
function shift(layout, delta, sign=1) {
    var [dx, dy] = [delta.x, delta.y]; // avoid aliasing
    function move(point) {
	point.x += sign*dx;
	point.y += sign*dy;
    }
    for (var pt of Object.values(layout)) move(pt);
}

function ingest(consumer, food) {
    for (var [name, pt] of Object.entries(food))
	consumer[name] = pt;
}

function xRadius(name, divs) {
    if (isUnion(name)) return 0;
    divs[name].style.display = "";
    return paddingAmount + divs[name].offsetWidth/2;
}

// y -> [min x, max x]
function rowRanges(layout, divs) {
    var result = {};
    for (var [name, pt] of Object.entries(layout)) {
	var delta = xRadius(name, divs);
	var isOld = result.hasOwnProperty(pt.y); 
	result[pt.y] = {
	    min: Math.min(...[pt.x - delta].concat(
		isOld ? [result[pt.y].min] : [])),
	    max: Math.max(...[pt.x + delta].concat(
		isOld ? [result[pt.y].max] : []))};
    }
    return result;
}

function collides(left, right, divs) {
    var layers = {};
    for (var [name, pt] of
	 Object.entries(left).concat(Object.entries(right))) {
	if (!layers.hasOwnProperty(pt.y))
	    layers[pt.y] = [];
	layers[pt.y].push([
	    pt.x - xRadius(name, divs),
	    pt.x + xRadius(name, divs),
	    name]);
    }
    for (var [y, intervals] of Object.entries(layers)) {
	var sorted = intervals.sort(
	    (a, b) => a[0] == b[0] ? a[1] - b[1] : a[0] - b[0]);
	for (var i = 0; i < sorted.length - 1; i++) {
	    if (sorted[i][1] > sorted[i+1][0]) return true;
	}
    }
    return false;
}

function mergedLayout(left, right, divs, moveRight=true, tryUnder=false) {
    if (tryUnder && !collides(left, right, divs)) {
	ingest(left, right);
	return left;
    }
    var lbounds = rowRanges(left, divs);
    var rbounds = rowRanges(right, divs);
    var shiftage = null;
    for (var y of Object.keys(lbounds)) {
	if (rbounds.hasOwnProperty(y)) {
	    var delta = lbounds[y].max-rbounds[y].min;
	    shiftage = shiftage==null ? delta : Math.max(shiftage, delta);
	}
    }
    if (shiftage==null) throw "merge without common y";
    if (moveRight) shift(right, {x: shiftage, y: 0});
    else shift(left, {x: -shiftage, y: 0});
    ingest(left, right);
    return left;
}

// returns a Layout including both name and pred, with name at (0, 0)
// if name/pred is horizontal, pred can be moved further outside bbox
function dumbLayout(name, pred, neighbours, divs, allowUp, downsRemaining, isDescendant) {
    if (includeAll)
	allowUp = true; // include parents of people marrying into family
    var result;
    if (isPerson(name)) {
	var leftUnion = getLeftUnion(name, neighbours);
	var rightUnion = getRightUnion(name, neighbours);
	var aboveUnion = getAboveUnion(name, neighbours);
	if (!allowUp && aboveUnion != pred) {
	    aboveUnion = null;
	}
	function doLayout(union, nameLocation, xshift, desc, allowUpRecursively) {
	    if (union == null) return null;
	    if (union == pred) result = {[union]: {x: 0, y: 0}, [name]: nameLocation};
	    else result = dumbLayout(union, name, neighbours, divs, allowUpRecursively, downsRemaining, desc);
	    shift(result, {x: xshift, y: 0});
	    return result;
	}
	var aboveLayout = doLayout(aboveUnion, {x:0, y:1}, 0, false, true);
	var leftLayout = doLayout(leftUnion, {x:xRadius(name, divs), y:0}, -xRadius(name, divs), isDescendant, false);
	var rightLayout = doLayout(rightUnion, {x:-xRadius(name, divs), y:0}, xRadius(name, divs), isDescendant, false);
	if (aboveLayout != null) {
	    shift(aboveLayout, aboveLayout[name], -1);
	    result = aboveLayout;
	}
	else result = {[name]: {x:0, y:0}};
    } else {  // name is a union
	// note, all 3 people are non-null
	var [leftParent, rightParent] = name.split(' + ');
	var children = (!isDescendant && downsRemaining == 0) ? [] : getChildren(name, neighbours);
	if (!isDescendant && downsRemaining == 0 && getChildren(name, neighbours).indexOf(pred) != -1) {
	    // In ancestors-only mode, need an override to show one child of all ancestor unions.
	    children = [pred];
	}
	function doLayout(person, nameLocation) {
	    if (person == pred) return {[person]: {x:0, y:0}, [name]: nameLocation};
	    else return dumbLayout(person, name, neighbours, divs, allowUp, downsRemaining, isDescendant);
	}
	var leftLayout = doLayout(leftParent, {x:xRadius(leftParent, divs), y:0});
	var rightLayout = doLayout(rightParent, {x:-xRadius(rightParent, divs), y:0});
	allowUp = false;
	downsRemaining -= 1;
	var childLayouts = children.map(child => doLayout(child, {x:0, y:-1}));
	if (childLayouts.length > 0) {
	    // remove union and concatenate layouts, shift down, add union back
	    for (var layout of childLayouts) delete layout[name];
	    result = childLayouts[0];
	    for (var childLayout of childLayouts.slice(1))
		result = mergedLayout(result, childLayout, divs);
	    var childXs = children.map(child => result[child].x);
	    var middle = (Math.min(...childXs) + Math.max(...childXs))/2;
	    shift(result, {x:-middle, y:1});
	    result[name] = {x:0, y:0};
	} else {
	    result = {[name]: {x:0, y:0}};
	}
    }
    // common to both cases
    if (leftLayout != null) {
	delete leftLayout[name];
	result = mergedLayout(leftLayout, result, divs, false, isPerson(name));
    }
    if (rightLayout != null) {
	delete rightLayout[name];
	result = mergedLayout(result, rightLayout, divs, true, isPerson(name));
    }
    return result;
}

function boundingBox(layout, divs) {
    function xbound(entry, sign) {
	var [name, pt] = entry;
	return pt.x + (
	    isUnion(name) ? 0 : sign*(
		paddingAmount + divs[name].offsetWidth/2));
    }
    return {bottomLeft: {
	x: Math.min(...Object.entries(layout).map(entry=>xbound(entry, -1))),
	y: Math.min(...Object.values(layout).map(pt=>pt.y))},
	    topRight: {
		x: Math.max(...Object.entries(layout).map(
		    entry=>xbound(entry, +1))),
		y: Math.max(...Object.values(layout).map(pt=>pt.y))}};
}

function adjustUnions(neighbours, layout, divs) {
    for (var node of Object.keys(layout)) {
	if (!isUnion(node)) continue;
	var children = getRenderedChildren(node, neighbours, layout);
	if (children.length == 0) continue;
	var [p1, p2] = node.split(' + ');
	var parentBottom = Math.max(layout[p1].y + divs[p1].offsetHeight/2,
                                    layout[p2].y + divs[p2].offsetHeight/2);
	var childTop = layout[children[0]].y - divs[children[0]].offsetHeight/2;
	for (var child of children) {
	    childTop = Math.min(
		childTop, layout[child].y - divs[child].offsetHeight/2);
	}
	if (childTop < parentBottom) {
	    throw "Union " + node
		+ " overlapped above/below. Try increasing lineHeight";
	}
	layout[node].y = (parentBottom + childTop) / 2;
    }   
}

function computeLayout(edges, neighbours, divs) {
    var layout = dumbLayout(rootName, null, neighbours, divs, true, includeAll ? -1 : downLimit, true);
    shift(layout, boundingBox(layout, divs).bottomLeft, -1);
    // Don't go into corner.
    shift(layout, {x:0, y:1});
    for (var pt of Object.values(layout)) {
	pt.y *= lineHeight;
    }
    adjustUnions(neighbours, layout, divs);
    return layout;
}

function displayName(name) {
    return name.replace(/#.*$/g, '');
}

function makeDiv(name, entries, neighbours) {
    var entry = entries[name];
    var result = document.createElement("div");
    var rawName = name;
    result.onclick = function() {changeRoot(rawName);};
    result.className = "label";
    var lines = displayName(name).replace('-', '\u2011').split(" ");
    var nameDiv = document.createElement("div");
    for (var i = 0; i < lines.length; i++) {
	if (i > 0) nameDiv.appendChild(document.createElement("br"));
	nameDiv.appendChild(document.createTextNode(lines[i]));
    }
    result.appendChild(nameDiv);
    var lifespanDiv = null;
    var photoDiv = null;
    var info = [];
    if (entry != null) {
	for (var data of entry) {
	    if (data.startsWith("l: ")) {
		lifespanDiv = document.createElement("div");
		var [birth, death] = data.substring(3).split('-');
		if (birth != "") {
		    lifespanDiv.appendChild(document.createTextNode(
			birth + (death == '' ? '\u2013' : '')));
		}
		if (birth != "" && death != "") {
		    lifespanDiv.appendChild(document.createElement("br"));
		}
		if (death != "") {
		    lifespanDiv.appendChild(document.createTextNode(
			'\u2013' + death));
		}
		lifespanDiv.className = "lifespan";
	    }
	    if (data.startsWith("p: ")) {
		photoDiv = document.createElement("img");
		imageTracker.numCreated++;
		photoDiv.onload = photoDiv.onerror = function() {
		    imageTracker.numDone++; imageLoadNotify();}
		photoDiv.src = photoDir + data.substring(3);
		photoDiv.style.width = "70px";
		photoDiv = document.createElement("div").appendChild(photoDiv);
	    }
	    if (data.startsWith("n: ")) {
		info.push(data.substring(3));
	    }
	}
    }
    function addMarriageInfo(partner, union) {
	var result = "";
	for (var data of entries[union]) {
	    if (data.startsWith("n: ")) {
		result += data.substring(3);
	    }
	}
	if (result.length == 0) return;
	info.push('With ' + displayName(partner) + ": " + result);
    }
    var leftUnion = getLeftUnion(name, neighbours);
    if (leftUnion != null)
	addMarriageInfo(leftUnion.split(' + ')[0], leftUnion);
    var rightUnion = getRightUnion(name, neighbours);
    if (rightUnion != null)
	addMarriageInfo(rightUnion.split(' + ')[1], rightUnion);

    if (photoDiv != null) {
	result.appendChild(photoDiv);
    }
    if (lifespanDiv != null) {
	result.appendChild(lifespanDiv);
    }
    function makeInfoDiv() {
	var result = document.createElement("ul");
	for (var item of info) {
	    var li = document.createElement("li");
	    for (var tok of item.split(/(http.*(?=(\w|$)))/g)) {
		if (tok.startsWith('http')) {
		    let a = document.createElement("a");
		    a.appendChild(document.createTextNode(tok));
		    a.href = tok;
		    a.target = '_blank';
		    li.appendChild(a);
		} else {
		    li.appendChild(document.createTextNode(tok));
		}
	    }
	    result.appendChild(li);
	}
	result.classList.add('info');
	return result;
    }
    if (info.length != 0) {
	result.classList.add('has-info');
    }
    result.onmouseover = function() {
	var panelBottom
	    = document.getElementById('info-pane-name').innerHTML
	    = displayName(name);
	var details = document.getElementById('info-pane-details');
	while (details.firstChild) {
	    details.removeChild(details.firstChild);
	}
	if (info.length != 0) {
	    details.appendChild(makeInfoDiv());
	    document.getElementById('info-pane').style.display = 'block';
	    document.getElementById('info-pane-placeholder')
		.style.display = 'none';
	} else {
	    document.getElementById('info-pane').style.display = 'none';
	    document.getElementById('info-pane-placeholder')
		.style.display = 'block';
	}
    }
    // For some reason size changes if not on-screen.
    document.body.appendChild(result);
    result.style.top = "200px";
    result.style.left = "200px";
    return result;
}

// name -> div
function makeDivs(edges, entries, neighbours) {
    var result = {};
    for (var [union, person] of edges) {
	if (!result.hasOwnProperty(person)) {
	    var entry = entries.hasOwnProperty(person) ? entries[person] : null;
	    result[person] = makeDiv(person, entries, neighbours);
	}
    }
    imageTracker.allCreated = true;
    return result;
}

function placeDiv(div, x, y) {
    div.style.visibility = "";
    div.style.left = "200px";
    div.style.top = "200px";
    div.style.top = (y - div.offsetHeight/2)+'px';
    div.style.left = (x - div.offsetWidth/2)+'px';
    div.style.top = (y - div.offsetHeight/2)+'px';
    div.style.left = (x - div.offsetWidth/2)+'px';
}

function hideDiv(div) {
    div.style.display = "none";
}


// https://stackoverflow.com/questions/4270485/drawing-lines-on-html-page
function createLine(x1, y1, x2, y2, lineClass) {
    function createLineElement(x, y, length, angle) {
	var line = document.createElement("div");
	var styles = 'border-style: solid; '
            + 'width: ' + length + 'px; '
            + 'height: 0px; '
            + '-moz-transform: rotate(' + angle + 'rad); '
            + '-webkit-transform: rotate(' + angle + 'rad); '
            + '-o-transform: rotate(' + angle + 'rad); '  
            + '-ms-transform: rotate(' + angle + 'rad); '  
            + 'position: absolute; '
            + 'top: ' + y + 'px; '
            + 'left: ' + x + 'px; ';
	line.setAttribute('style', styles);  
	line.classList.add('drawn-line');
	line.classList.add(lineClass);
	return line;
    }

    var a = x1 - x2,
	b = y1 - y2,
	c = Math.sqrt(a * a + b * b);
    var sx = (x1 + x2) / 2,
	sy = (y1 + y2) / 2;
    var x = sx - c / 2,
	y = sy;
    var alpha = Math.PI - Math.atan2(-b, a);
    return createLineElement(x, y, c, alpha);
}

function drawLine(p, q, lineClass) {
    document.body.appendChild(createLine(p.x, p.y, q.x, q.y, lineClass));
}

function getRenderedChildren(union, neighbours, layout) {
    var result = [];
    var children = getChildren(union, neighbours);
    for (var child of children) {
	if (layout.hasOwnProperty(child)) result.push(child);
    }
    return result;
}

function hasRenderedChildren(union, neighbours, layout) {
    return getRenderedChildren(union, neighbours, layout).length > 0;
}

function connect(node1, node2, layout, neighbours, divs, lineClass) {
    var [person, union] = isPerson(node1) ? [node1, node2] : [node2, node1];
    if (union.split(' + ').indexOf(person) > -1) {
	// Connect person with union to a partner
	if (hasRenderedChildren(union, neighbours, layout)) {
	    // Line from bottom of person
	    var fudgeFixBelowParent = 4;
	    drawLine({x:layout[person].x,
                      y:layout[person].y + divs[person].offsetHeight/2
		      - fudgeFixBelowParent},
		     {x:layout[union].x,
                      y:layout[union].y}, lineClass);
	} else {
	    // Line from side of person
	    var isLeftPersonOfUnion = union.split(' + ')[0] == person;
	    drawLine({x:layout[person].x
		      + (isLeftPersonOfUnion ? 1 : -1)
		      * divs[person].offsetWidth/2,
                      y:layout[person].y},
		     {x:layout[union].x,
                      y:layout[union].y}, lineClass);
	}
    } else {
	// Connect person with union to a parent
	// Line from top of person
	drawLine({x:layout[person].x,
		  y:layout[person].y - divs[person].offsetHeight/2},
		 {x:layout[union].x,
		  y:layout[union].y}, lineClass);
    }
}

function scrollToElement(element) {
    const elementRect = element.getBoundingClientRect();
    const elementMiddleY = window.pageYOffset + elementRect.top
	  + element.offsetHeight / 2;
    const y = elementMiddleY - (window.innerHeight / 2);
    const elementMiddleX = window.pageXOffset + elementRect.left
	  + element.offsetWidth / 2;
    const x = elementMiddleX - (window.innerWidth / 2);
    window.scrollTo(x,
		    y
		    - document.getElementById('control-panel').offsetHeight/2);
    element.focus();
}

function traverse(name, pred, neighbours, divs, layout, mode, isAncestor, isDescendant, isBlood) {
    var posClass;
    if (pred == null) {
	posClass = "pos-root";
    } else if (isAncestor) {
	posClass = "pos-ancestor";
    } else if (isDescendant) {
	posClass = "pos-descendant";
    } else if (isBlood) {
	posClass = "pos-blood";
    } else {
	posClass = "pos-other";
    }
    if (mode=="drawConnections"
	&& layout.hasOwnProperty(name) && layout.hasOwnProperty(pred)) {
	if (isUnion(name) && name.split(' + ').includes(pred)
	    && getRenderedChildren(name, neighbours, layout).length == 0) {
	    // Avoid half-colored links
	    connect(name, pred, layout, neighbours, divs, "pos-other");
	} else {
	    connect(name, pred, layout, neighbours, divs, posClass);
	}
    }
    function recur(newName, isAncestor, isDescendant, isBlood) {
	if (newName == pred) return;
	traverse(newName, name, neighbours, divs, layout, mode, isAncestor, isDescendant, isBlood);
    }
    if (isPerson(name)) {
	if (mode=="setPeopleClasses") {
	    divs[name].classList.add(posClass);
	}
	var leftUnion = getLeftUnion(name, neighbours);
	if (leftUnion)
	    recur(leftUnion, false, isDescendant, isBlood || isAncestor);
	var rightUnion = getRightUnion(name, neighbours);
	if (rightUnion)
	    recur(rightUnion, false, isDescendant, isBlood || isAncestor);
	var aboveUnion = getAboveUnion(name, neighbours);
	if (aboveUnion) {
	    recur(aboveUnion, isAncestor, false, false);
	}
    } else {
	var [p1, p2] = name.split(' + ');
	recur(p1, isAncestor, false, false);
	recur(p2, isAncestor, false, false);
	for (var child of getChildren(name, neighbours)) {
	    recur(child, false, isDescendant, isBlood || isAncestor);
	}
    }
}

function setPeopleClasses(rootName, neighbours, divs) {
    traverse(rootName, null, neighbours, divs, null,
	     "setPeopleClasses", true, true, true);
}

function drawConnections(rootName, neighbours, divs, layout) {
    traverse(rootName, null, neighbours, divs, layout,
	     "drawConnections", true, true, true);
}

function drawTree(entries, edges, divs, neighbours) {
    if (!divs[rootName])
        throw "Selected name not found in data: " + rootName;
    // Since classes affect div size, do it before layout.
    setPeopleClasses(rootName, neighbours, divs);
    var layout = computeLayout(edges, neighbours, divs);
    var box = boundingBox(layout, divs);
    shift(layout, {x:0,
		   y:0.5*lineHeight
		   - box.bottomLeft.y
		   + document.getElementById('control-panel').offsetHeight});
    drawConnections(rootName, neighbours, divs, layout);
    for (var [u, v] of edges) {
	// v is a person
	if (layout.hasOwnProperty(v)) {
	    placeDiv(divs[v], layout[v].x, layout[v].y);
	} else {
	    hideDiv(divs[v]);
	}
    }
    scrollToElement(divs[rootName]);
    document.getElementById('root-name').innerText
	= rootName.replace(/#.*$/g, '');
    document.getElementById('detail-picker').value
	= includeAll ? "Everyone" : downLimit;
    updateTreeInformation(layout, divs);
    window.state = {entries, edges, divs, neighbours, layout, box};
}

function updateTreeInformation(layout, divs) {
    var infodiv = document.getElementById('tree-information');
    var ancestors = 0, descendants = 0, blood = 0, others = 0;
    for (var [person, div] of Object.entries(divs)) {
	if (!layout.hasOwnProperty(person)) continue;
	var hasClass = (c => div.classList.contains(c));
	if (hasClass('pos-ancestor')) ancestors++;
	if (hasClass('pos-descendant')) descendants++;
	if (hasClass('pos-blood')) blood++;
	if (hasClass('pos-other')) others++;
    }
    var counts = [];
    function process(number, description, textClass) {
	if (number > 0)
	    counts.push('<span class="' + textClass + '">'
			+ number + " " + description
			+ "</span>");
    }
    process(descendants, "descendants", "text-descendant");
    process(ancestors, "ancestors", "text-ancestor");
    process(blood, "blood relatives", "text-blood");
    process(others, "others", "text-other");
    var result = 'Showing ';
    for (var i=0; i<counts.length; i++) {
	result += counts[i];
	if (i==counts.length-2) result += " and ";
	if (i<counts.length-2) result += ", ";
    }
    result += ' (total '
	+ (ancestors + blood + descendants + others + 1)
	+ ').';
    infodiv.innerHTML = result;
}

function updateDetail() {
    var choice = document.getElementById('detail-picker').value;
    if (choice == 'Everyone') {
	includeAll = true;
	downLimit = Infinity;
    } else {
	includeAll = false;
	downLimit = Number(choice);
    }
    redraw();
    document.activeElement.blur();
}

function validateTreeStructure(entries, edges, neighbours) {
    var parent = {};  // null parent means visited, root of its component.
    function buildConnectedComponent(curr, prev, component) {
	if (parent.hasOwnProperty(curr)) {
	    // Indicates a loop. Since it's dfs it's a parent chain.
	    let loop = [curr, prev];
	    let unroll = prev;
	    while (unroll != curr) {
		if (unroll == null)
		    throw "Internal validation error (file a bug!)";
		unroll = parent[unroll];
		loop.push(unroll);
	    }
	    throw "Loop detected: " + loop;
	}
	parent[curr] = prev;
	component[curr] = true;
	for (let x of neighbours[curr]) {
	    if (x==prev) continue;
	    buildConnectedComponent(x, curr, component);
	}
    }

    var components = [];
    for (let name of Object.keys(entries)) {
	if (!neighbours.hasOwnProperty(name)) {
	    throw "Singleton node or malformatted line: " + name;
	}
	if (parent.hasOwnProperty(name)) continue;
	var component = {};
	buildConnectedComponent(name, null, component);
	components.push([name, component]);
    }
    if (components.length > 1) {
	let msg = "Multiple connected components";
	for (let [name, component] of components) {
	    msg += " | "
		+ Object.keys(component).length + " connected to " + name;
	}
	throw msg;
    }
}

function errorOut(error) {
    console.log(error);
    alert(error);
    throw error;
}

function asyncLoadTextFile(filename, successCallback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", filename, true);
    xhr.onload = function (e) {
	if (xhr.readyState === 4 && xhr.status === 200) {
	    try {
		successCallback(xhr.responseText.replace(/\r/g, ''));
	    } catch (error) {
		errorOut(error);
	    }
	} else {
	    errorOut(xhr.statusText);
	}
    };
    xhr.onerror = errorOut;
    xhr.send();
}

window.onload = function() {
    asyncLoadTextFile(familyDataFilename, processFamilyTxt);
}

function processFamilyTxt(family_txt) {
    var entries = readInput(family_txt);
    var edges = getEdges(entries);
    var neighbours = getNeighbours(edges);
    validateTreeStructure(entries, edges, neighbours);
    var divs = makeDivs(edges, entries, neighbours);
    readHash();
    drawTree(entries, edges, divs, neighbours);
    window.state = {entries, edges, divs, neighbours};
    window.onpopstate = function() {
	readHash();
	redraw();
    }
    // Uncomment this only if you want to generate a fake file from your data.
    // writeFakeDebug(entries);
}

function writeFakeDebug(entries) {
    asyncLoadTextFile("simpsons-names.txt",
                      function(text) {processFakeDebug(entries, text);});
}

function processFakeDebug(entries, simpsonsNamesTxt) {
    var numUsedSimpsons = 0;
    var simpsons = simpsonsNamesTxt.split('\n');
    function newSimpson() {
	return simpsons[numUsedSimpsons++];
    }
    var chosenNames = {};
    function simpsonName(realName) {
	if (chosenNames[realName])
	    return chosenNames[realName];
	var result;
	if (realName.includes('#')) {
	    var [displayName, comment] = realName.split('#');
	    if (displayName=='?') return realName;
	    result = newSimpson() + '#' + comment;
	} else {
	    result = newSimpson();
	}
	chosenNames[realName] = result;
	return result;
    }
    for (var [name, data] of Object.entries(entries)) {
	console.log(name.split(' + ').map(simpsonName).join(' + '));
	for (var d of data) {
	    if (d.startsWith('c:')) {
		var n = d.substring(3).split(', ');
		console.log(' c: ' + n.map(simpsonName).join(', '));
	    } else if (d.startsWith('p:')) {
                // simpsons photos are 1.png to 299.png
		console.log(' p: ' + 'simpsons/' + (
                    1+Math.floor(298*Math.random())) + '.png');
	    } else if (d.startsWith('n:')) {
                function replace(tok) {
                    if (tok.startsWith('http'))
                        return 'http://simpsons.wikia.com/wiki/Portal:All_Simpson_Characters';
                    else
                        return 'blah';
                }
		console.log(' n: ' + d.substring(3).split(' ').map(replace).join(' '));
	    }
	    else
		console.log(' ' + d);
	}
    }
}

function imageLoadNotify() {
    if (imageTracker.allCreated
	&& imageTracker.numDone == imageTracker.numCreated) {
	redraw();
    }
}

function redraw() {
    for (var div of Array.from(document.getElementsByClassName('drawn-line'))) {
	div.parentNode.removeChild(div);
    }
    for (var kind of ["root", "ancestor", "blood", "descendant", "other"]) {
	for (var el of Array.from(
	    document.getElementsByClassName("pos-"+kind))) {
	    el.classList.remove("pos-"+kind);
	}
    }
    drawTree(window.state.entries, window.state.edges, window.state.divs, window.state.neighbours);
    updateHash();
}

function changeRoot(person) {
    rootName = person;
    document.title = person + "'s Family Tree";
    redraw();
}

function updateHash() {
    window.location.hash = '#' + encodeURIComponent(rootName)
	+ ':' + document.getElementById('detail-picker').value;
}

function readHash() {
    if (window.location.hash.startsWith('#')) {
	var [name, detail] = window.location.hash.substr(1).split(':');
	rootName = decodeURIComponent(name);
	document.getElementById('detail-picker').value = detail;
    }
    document.title = rootName + "'s Family Tree";
}
