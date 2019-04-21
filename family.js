/* -*- mode: javascript; js-indent-level: 2 -*- */
'use strict';

// Override these settings:
var familyDataFilename = "simpsons-family.txt"; // Your own family.txt
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

// Basic parsing functions taking a string as input
function isPerson(name) {
  return !name.includes(' + ');
}
function isUnion(name) {
  return name.includes(' + ');
}

// Input: text from familyDataFilename
// Output: "entries" = map<name of person or union, list of data rows for them>
function getEntries(text) {
  var lines = text.split('\n');
  var result = {};
  var i = 0;

  var uniqueCounter = 0; // To replace ? by unique identifiers.
  function makeUnique(str) {
    uniqueCounter += 1;
    return str + '#' + uniqueCounter;
  }
  let correctedLabel = str =>
      (str == "?" || str == "...") ? makeUnique(str) : str;

  // skip line if comment or blank. return true iff it was a comment or blank.
  function trySkipComment() {
    if (i >= lines.length
        || !(lines[i].startsWith('#') || lines[i].trim() === ""))
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
      toks = toks.map(correctedLabel);
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
      if (trimmedLine.substr(0, 3) == "c: ") {
        let children = trimmedLine.substr(3).split(", ").map(correctedLabel);
        trimmedLine = "c: " + children.join(", ");
        if (children.includes(toks[0]))
          throw toks[0] + " is listed as their own child";
        if (children.includes(toks[1]))
          throw toks[1] + " is listed as their own child";
      }
      value.push(trimmedLine);
      i += 1;
    }
    result[key] = value;
  }
  return result;
}

// Rewrite as undirected bipartite graph on people and unions
// Output: map<person or union name, list<adjacent union or person names>>
function getNeighbours(entries) {
  var result = {};
  // Ensure singleton nodes are included:
  for (let name of Object.keys(entries)) result[name] = [];

  function addHalfEdge(x, y) {
    if (!result.hasOwnProperty(x)) result[x] = [];
    result[x].push(y);
  }
  for (let [name, props] of Object.entries(entries)) {
    if (isPerson(name)) continue;
    var [p1, p2] = name.split(' + ');
    var newName = p1 + ' + ' + p2;
    var children = [];
    for (var prop of props) {
      if (prop.startsWith('c: '))
        children = prop.substring(3).split(', ');
    }
    for (var x of children.concat([p1, p2])) {
      addHalfEdge(newName, x);
      addHalfEdge(x, newName);
    }
  }
  return result;
}

// Get union where this person was one of the two parents, or null if none.
// 0: left side, 1: right side
function getUnion(person, neighbours, side) {
  var result = [];
  for (let name of neighbours[person]) {
    var members = name.split(' + ');
    if (members[1 - side]==person) result.push(name);
  }
  if (result.length===0) return null;
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
  for (let name of neighbours[person]) {
    if (!name.split(' + ').includes(person))
      return name;
  }
  return null;
}

function getChildren(union, neighbours) {
  if (union===null) return [];
  return neighbours[union].filter(
    name => !union.split(' + ').includes(name));
}

// A layout is a map <person or union name, {x:..., y:...}>
// Here x is in pixels and y is in "generations" (lineHeight high each)

// Update layout in-place
function shift(layout, delta, sign=1) {
  var [dx, dy] = [delta.x, delta.y]; // avoid aliasing if delta is from layout
  function move(point) {
    point.x += sign*dx;
    point.y += sign*dy;
  }
  for (var pt of Object.values(layout)) move(pt);
}

// Use "visibility" instead of "display" b/c sizes still exist
function showDiv(div, displayMode=false) {
  if (displayMode) {
    div.style.display = "block";
  } else {
    div.style.visibility = "";
  }
}

function hideDiv(div, displayMode=false) {
  if (displayMode) {
    div.style.display = "none";
  } else {
    div.style.visibility = "hidden";
  }
}

// How much space is needed from the center of this person/union to either side?
function xRadius(name, divs) {
  if (isUnion(name)) return 0;
  return paddingAmount + divs[name].offsetWidth/2;
}

// Returns map <y, [min x, max x]>
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

// Do Layouts left and right collide?
function collides(left, right, divs) {
  var layers = {};
  for (var [name, pt] of
       Object.entries(left).concat(Object.entries(right))) {
    if (!layers.hasOwnProperty(pt.y))
      layers[pt.y] = [];
    layers[pt.y].push([
      pt.x - xRadius(name, divs),
      pt.x + xRadius(name, divs)]);
  }
  for (var [_, intervals] of Object.entries(layers)) {
    var sorted = intervals.sort(
      (a, b) => a[0] == b[0] ? a[1] - b[1] : a[0] - b[0]);
    for (var i = 0; i < sorted.length - 1; i++) {
      if (sorted[i][1] > sorted[i+1][0]) return true;
    }
  }
  return false;
}

// If tryUnder, we'll try both layouts as-is.
// Otherwise move left or right layout to fit side-by-side.
function mergedLayout(left, right, divs, moveRight=true, tryUnder=false) {
  if (tryUnder && !collides(left, right, divs)) {
    return Object.assign(left, right);
  }
  var lbounds = rowRanges(left, divs);
  var rbounds = rowRanges(right, divs);
  var shiftage = null;
  for (var y of Object.keys(lbounds)) {
    if (rbounds.hasOwnProperty(y)) {
      var delta = lbounds[y].max-rbounds[y].min;
      shiftage = shiftage===null ? delta : Math.max(shiftage, delta);
    }
  }
  if (shiftage===null) throw "merge without common y";
  if (moveRight) shift(right, {x: shiftage, y: 0});
  else shift(left, {x: -shiftage, y: 0});
  return Object.assign(left, right);
}

Set.prototype.union = function(setB) {
  var union = new Set(this);
  for (var elem of setB) {
    union.add(elem);
  }
  return union;
};

// returns a Set of all nodes that should be rendered
function getVisibleNodes(
  name, pred, neighbours,
  path = {allowUp: true, downsLeft: downLimit, desc: true}) {
  if (includeAll) {
    return new Set(Object.keys(neighbours));
  }
  let getNodes = function(newName, newPath) {
    if (newName === null || newName == pred) return new Set([]);
    return getVisibleNodes(newName, name, neighbours,
                           Object.assign({}, path, newPath));
  };
  if (isPerson(name)) {
    let leftUnion = getLeftUnion(name, neighbours);
    let rightUnion = getRightUnion(name, neighbours);
    let aboveUnion = path.allowUp ? getAboveUnion(name, neighbours) : null;
    return new Set([name]).
      union(getNodes(aboveUnion, {desc: false})).
      union(getNodes(leftUnion, {allowUp: false})).
      union(getNodes(rightUnion, {allowUp: false}));
  } else {  // name is a union
    let [leftParent, rightParent] = name.split(' + ');
    let children = (!path.desc && path.downsLeft === 0)
        ? [] : getChildren(name, neighbours);
    let result = new Set([name]).
        union(getNodes(leftParent, {})).
        union(getNodes(rightParent, {}));
    for (let child of children) {
      result = result.union(getNodes(
        child,
        {allowUp: false, downsLeft: path.downsLeft - 1}));
    }
    return result;
  }
}

// returns a Layout including name, pred, and nothing beyond pred from name
// name will be at (0, 0)
function dumbLayout(name, pred, neighbours, divs, visibleNodes) {
  // Return recursive layout with name at 0, 0
  // If next==pred, return doubleton Layout w/ next/pred at defaultLocation
  // (though side layouts don't need a defaultLocation due to merge shifting)
  let doLayout = function(next, defaultLocation = {x:0, y:0}) {
    if (next === null || !visibleNodes.has(next)) return null;
    if (next == pred) return {[name]: {x:0, y:0}, [next]: defaultLocation};
    let result = dumbLayout(next, name, neighbours, divs, visibleNodes);
    shift(result, result[name], -1);
    return result;
  };

  // Central layout to merge into and its default value. It is the return value.
  var mainLayout = {[name]: {x:0, y:0}};
  var leftLayout, rightLayout;  // These are merged into mainLayout.
  if (isPerson(name)) {
    let leftUnion = getLeftUnion(name, neighbours);
    let rightUnion = getRightUnion(name, neighbours);
    let aboveUnion = getAboveUnion(name, neighbours);
    leftLayout = doLayout(leftUnion);
    rightLayout = doLayout(rightUnion);
    let aboveLayout = doLayout(aboveUnion, {x:0, y:-1});  // -1 is up
    if (aboveLayout !== null) mainLayout = aboveLayout;
  } else {  // name is a union
    // If union is visible, so are the members of it, but maybe not all children
    let [leftParent, rightParent] = name.split(' + ');
    let children = getChildren(name, neighbours)
        .filter(x => visibleNodes.has(x));
    leftLayout = doLayout(leftParent);
    rightLayout = doLayout(rightParent);
    let childLayouts = children.map(child => doLayout(child, {x:0, y:1}));
    if (childLayouts.length > 0) {
      // remove union and concatenate layouts, center, add union back
      for (let childLayout of childLayouts) delete childLayout[name];
      mainLayout = childLayouts[0];
      for (let childLayout of childLayouts.slice(1))
        mainLayout = mergedLayout(mainLayout, childLayout, divs);
      var childXs = children.map(child => mainLayout[child].x);
      var middle = (Math.min(...childXs) + Math.max(...childXs))/2;
      shift(mainLayout, {x:-middle, y:0});
      mainLayout[name] = {x:0, y:0};
    }
  }
  // common to both cases, merge side layouts into center one.
  if (leftLayout !== null) {
    delete leftLayout[name];
    mainLayout =
      mergedLayout(leftLayout, mainLayout, divs, false, isPerson(name));
  }
  if (rightLayout !== null) {
    delete rightLayout[name];
    mainLayout =
      mergedLayout(mainLayout, rightLayout, divs, true, isPerson(name));
  }
  return mainLayout;
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
    if (children.length === 0) continue;
    var [p1, p2] = node.split(' + ');
    var parentBottom = Math.max(layout[p1].y + divs[p1].offsetHeight/2,
                                layout[p2].y + divs[p2].offsetHeight/2);
    var childTop = layout[children[0]].y - divs[children[0]].offsetHeight/2;
    for (var child of children) {
      childTop = Math.min(
        childTop, layout[child].y - divs[child].offsetHeight/2);
    }
    if (childTop < parentBottom) {
      errorOut("Union " + node
               + " overlapped above/below. Try increasing lineHeight");
    }
    layout[node].y = (parentBottom + childTop) / 2;
  }
}

function computeLayout(neighbours, divs) {
  var visibleNodes = getVisibleNodes(rootName, null, neighbours);
  var layout = dumbLayout(rootName, null, neighbours, divs, visibleNodes);
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

function photoLoadCallback() {
  imageTracker.numDone++;
  imageLoadNotify();
}

function makeDiv(name, entries, neighbours) {
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
  if (entries[name]) {
    for (var data of entries[name]) {
      if (data.startsWith("l: ")) {
        lifespanDiv = document.createElement("div");
        var [birth, death] = data.substring(3).split('-');
        if (birth !== "") {
          lifespanDiv.appendChild(document.createTextNode(
            birth + (death === '' ? '\u2013' : '')));
        }
        if (birth !== "" && death !== "") {
          lifespanDiv.appendChild(document.createElement("br"));
        }
        if (death !== "") {
          lifespanDiv.appendChild(document.createTextNode(
            '\u2013' + death));
        }
        lifespanDiv.className = "lifespan";
      }
      if (data.startsWith("p: ")) {
        photoDiv = document.createElement("img");
        imageTracker.numCreated++;
        photoDiv.onload = photoDiv.onerror = photoLoadCallback;
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
    if (result.length === 0) return;
    info.push('With ' + displayName(partner) + ": " + result);
  }
  var leftUnion = getLeftUnion(name, neighbours);
  if (leftUnion !== null)
    addMarriageInfo(leftUnion.split(' + ')[0], leftUnion);
  var rightUnion = getRightUnion(name, neighbours);
  if (rightUnion !== null)
    addMarriageInfo(rightUnion.split(' + ')[1], rightUnion);

  if (photoDiv !== null) {
    result.appendChild(photoDiv);
  }
  if (lifespanDiv !== null) {
    result.appendChild(lifespanDiv);
  }
  function makeInfoDiv() {
    var result = document.createElement("ul");
    for (var item of info) {
      var li = document.createElement("li");
      for (var tok of item.split(/(http[^\s]*(?=(\s|$)))/g)) {
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
  if (info.length !== 0) {
    result.classList.add('has-info');
  }
  result.onmouseover = function() {
    document.getElementById('info-pane-name').innerHTML = displayName(name);
    var details = document.getElementById('info-pane-details');
    while (details.firstChild) {
      details.removeChild(details.firstChild);
    }
    if (info.length !== 0) {
      details.appendChild(makeInfoDiv());
      showDiv(document.getElementById('info-pane'), true);
      hideDiv(document.getElementById('info-pane-placeholder'), true);
    } else {
      hideDiv(document.getElementById('info-pane'), true);
      showDiv(document.getElementById('info-pane-placeholder'), true);
    }
  };
  // For some reason size changes if not on-screen.
  document.body.appendChild(result);
  result.style.top = "200px";
  result.style.left = "200px";
  hideDiv(result);
  return result;
}

// name -> div
function makeDivs(entries, neighbours) {
  var result = {};
  for (var name of Object.keys(neighbours)) {
    if (isPerson(name)) {
      result[name] = makeDiv(name, entries, neighbours);
    }
  }
  imageTracker.allCreated = true;
  return result;
}

function placeDiv(div, x, y) {
  showDiv(div);
  div.style.top = (y - div.offsetHeight/2)+'px';
  div.style.left = (x - div.offsetWidth/2)+'px';
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
  if (union.split(' + ').includes(person)) {
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
                  y - document.getElementById('control-panel').offsetHeight/2);
  element.focus();
}

function traverse(name, pred, neighbours, divs, layout, mode,
                  flags = {ancestor: true, descendant: true, blood: true}) {
  var posClass;
  if (pred === null) {
    posClass = "pos-root";
  } else if (flags.ancestor) {
    posClass = "pos-ancestor";
  } else if (flags.descendant) {
    posClass = "pos-descendant";
  } else if (flags.blood) {
    posClass = "pos-blood";
  } else {
    posClass = "pos-other";
  }
  if (mode=="drawConnections"
      && layout.hasOwnProperty(name) && layout.hasOwnProperty(pred)) {
    if (isUnion(name) && name.split(' + ').includes(pred)
        && getRenderedChildren(name, neighbours, layout).length === 0) {
      // Avoid half-colored links
      connect(name, pred, layout, neighbours, divs, "pos-other");
    } else {
      connect(name, pred, layout, neighbours, divs, posClass);
    }
  }
  function recur(newName, newFlags) {
    if (newName === null || newName == pred) return;
    traverse(newName, name, neighbours, divs, layout, mode,
             Object.assign({}, flags, newFlags));
  }
  if (isPerson(name)) {
    if (mode=="setPeopleClasses") {
      divs[name].classList.add(posClass);
    }
    var leftUnion = getLeftUnion(name, neighbours);
    recur(leftUnion, {ancestor: false, blood: flags.ancestor || flags.blood});
    var rightUnion = getRightUnion(name, neighbours);
    recur(rightUnion, {ancestor: false, blood: flags.ancestor || flags.blood});
    var aboveUnion = getAboveUnion(name, neighbours);
    recur(aboveUnion, {blood: false, descendant: false});
  } else {
    var [p1, p2] = name.split(' + ');
    recur(p1, {blood: false, descendant: false});
    recur(p2, {blood: false, descendant: false});
    for (var child of getChildren(name, neighbours)) {
      recur(child, {ancestor: false, blood: flags.ancestor || flags.blood});
    }
  }
}

function setPeopleClasses(rootName, neighbours, divs) {
  traverse(rootName, null, neighbours, divs, null, "setPeopleClasses");
}

function drawConnections(rootName, neighbours, divs, layout) {
  traverse(rootName, null, neighbours, divs, layout, "drawConnections");
}

function drawTree(divs, neighbours) {
  if (!divs[rootName])
    throw "Selected name not found in data: " + rootName;
  // Since classes affect div size, do it before layout.
  setPeopleClasses(rootName, neighbours, divs);
  var layout = computeLayout(neighbours, divs);
  var box = boundingBox(layout, divs);
  shift(layout, {x:0,
                 y:0.5*lineHeight
                 - box.bottomLeft.y
                 + document.getElementById('control-panel').offsetHeight});
  drawConnections(rootName, neighbours, divs, layout);
  for (let name of Object.keys(neighbours)) {
    if (isPerson(name)) {
      if (layout.hasOwnProperty(name)) {
        placeDiv(divs[name], layout[name].x, layout[name].y);
      } else {
        hideDiv(divs[name]);
        // Stuck divs would make window always stay giant.
        divs[name].style.top = '100px';
        divs[name].style.left = '100px';
      }
    }
  }
  scrollToElement(divs[rootName]);
  updateTreeInformation(layout, divs);
}

function updateTreeInformation(layout, divs) {
  var infodiv = document.getElementById('tree-information');
  var ancestors = 0, descendants = 0, blood = 0, others = 0;
  for (var [person, div] of Object.entries(divs)) {
    if (!layout.hasOwnProperty(person)) continue;
    if (div.classList.contains('pos-ancestor')) ancestors++;
    if (div.classList.contains('pos-descendant')) descendants++;
    if (div.classList.contains('pos-blood')) blood++;
    if (div.classList.contains('pos-other')) others++;
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

function setVarsFromDetailOption() {
  var choice = document.getElementById('detail-picker').value;
  if (choice == 'Everyone') {
    includeAll = true;
    downLimit = Infinity;
  } else {
    includeAll = false;
    downLimit = Number(choice);
  }
}

function updateDetail() {
  setVarsFromDetailOption();
  redraw();
  document.activeElement.blur();
}

function validateTreeStructure(neighbours) {
  var parent = {};  // null parent means visited, root of its component.
  function buildConnectedComponent(curr, prev, component) {
    if (parent.hasOwnProperty(curr)) {
      // Indicates a loop. Since it's dfs it's a parent chain.
      let loop = [curr, prev];
      let unroll = prev;
      while (unroll != curr) {
        if (unroll === null) {
          throw "Internal validation error (file a bug!)";
        }
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
  for (let name of Object.keys(neighbours)) {
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
};

function processFamilyTxt(family_txt) {
  var entries = getEntries(family_txt);
  var neighbours = getNeighbours(entries);
  validateTreeStructure(neighbours);
  var divs = makeDivs(entries, neighbours);
  // Need to save divs and neighbours, also keep entries for debugging.
  window.state = {entries, divs, neighbours};

  readHash();
  drawTree(divs, neighbours);
  window.onpopstate = function() {
    readHash();
    redraw();
  };
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
  drawTree(window.state.divs, window.state.neighbours);
  updateHash();
}

function changeRoot(person) {
  rootName = person;
  showRootName();
  redraw();
}

function updateHash() {
  window.location.hash = '#' + encodeURIComponent(rootName)
    + ':' + document.getElementById('detail-picker').value;
}

function showRootName() {
  document.title = displayName(rootName) + "'s Family Tree";
  document.getElementById('root-name').innerText = displayName(rootName);
}

function readHash() {
  if (window.location.hash.startsWith('#')) {
    var [name, detail] = window.location.hash.substr(1).split(':');
    rootName = decodeURIComponent(name);
    document.getElementById('detail-picker').value = detail;
  }
  setVarsFromDetailOption();
  showRootName();
}
