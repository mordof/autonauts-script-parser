const canvas = document.createElement('canvas');
const output = document.getElementById('output');

let scriptImg;
let lineLength;
let entryLength;

const entryHeight = 30;
const entryBorderSize = 4;
const indentWidth = 30;

const worker = Tesseract.createWorker();

const parseScriptImage = async (data) => {
  const entries = [];

  for (let i = 0, c = scriptImg.height / entryHeight; i < c; i++) {
    const entry = getEntry(data, i + 1);
  
    const indentLevel = identifyEntryIndentLevel(entry);
    const entryType = identifyEntryType(entry, indentLevel);

    if (entryType !== 'loopEnd' && entryType !== 'shout' && entryType !== 'wait') {
      let backgroundColor = colors[entryType] ? colors[entryType].background : undefined; 
      const entryCanvas = document.createElement('canvas');

      let endX;

      if (entryType === 'loopStart') {
        endX = findEndOfLoopCondition(entry);
      } else {
        endX = findEndOfEntry(entry);
      }
      
      const ocrY = 4;
      const ocrHeight = entryHeight - 8;
      let ocrX = indentLevel * indentWidth + 6;
      let ocrWidth = endX - 8 - ocrX;

      let ocrMarginLeft = 0;
      let ocrMarginRight = 0;
      let ocrMarginTop = 0;
      let ocrMarginBottom = 0;

      if (entryType === 'loopStart') {
        backgroundColor = colors.loopWait.conditionBackground;
        // we want to trim out the 'Repeat'
        ocrX = ocrX + 58;
        ocrWidth = endX - 8 - ocrX - 16;
      }

      if (entryType === 'find') {
        ocrWidth = ocrWidth - 34;
        ocrMarginLeft = 2;
        ocrMarginRight = 2;
      }

      if ((entryType === 'move' && findMoveStructureButton(entry, colors.move.background)) 
        || (entryType === 'pickupTakefromAddtoDrop' && findMoveStructureButton(entry, colors.pickupTakefromAddtoDrop.background))
      ) {
        ocrWidth = ocrWidth - 20;
      }

      let retries = 14;
      let ocrText;
      let ocrConfidence;
      let ocrPassed = false;

      while (retries > -1) {
        entryCanvas.width = ocrWidth;
        entryCanvas.height = ocrHeight;
        const ctx = entryCanvas.getContext('2d')
        const imageData = ctx.getImageData(0, 0, ocrWidth, ocrHeight);
  
        const data = imageData.data;
        const ocrEntry = getSubsetOfEntry(entry, ocrX, ocrY, ocrWidth, ocrHeight);
        for (let i = 0, l = ocrEntry.length; i < l; i++) {
          data[i] = ocrEntry[i];
        }
  
        entryCanvas.width = ocrWidth + ocrMarginLeft + ocrMarginRight;
        entryCanvas.height = ocrHeight + ocrMarginTop + ocrMarginBottom;
        ctx.fillStyle = `rgb(${backgroundColor[0]}, ${backgroundColor[1]}, ${backgroundColor[2]})`;
        ctx.rect(0, 0, ocrMarginLeft, ocrHeight + ocrMarginLeft + ocrMarginRight);
        ctx.rect(0, 0, ocrWidth + ocrMarginLeft + ocrMarginRight, ocrMarginTop);
        ctx.rect(0, ocrHeight + ocrMarginTop, ocrWidth + ocrMarginLeft + ocrMarginRight, ocrMarginBottom);
        ctx.rect(ocrWidth + ocrMarginLeft, 0, ocrMarginRight, ocrHeight);
        ctx.fill()
        ctx.putImageData(imageData, ocrMarginLeft, ocrMarginTop);
  
        const { data: { text, confidence } } = await worker.recognize(entryCanvas);
        ocrText = text.trim();

        if (confidence < 60){
          ocrConfidence = confidence;
          // document.querySelector('body').appendChild(entryCanvas);
          ocrMarginLeft += (retries % 4) === 0 ? 1 : 0;
          ocrMarginRight += (retries % 4) === 1 ? 1 : 0;
          if (retries < 8) {
            ocrMarginTop += (retries % 4) === 2 ? 1 : 0;
            ocrMarginBottom += (retries % 4) === 3 ? 1 : 0;
          }
          retries--;
        } else {
          ocrPassed = true;
          break;
        }
      }

      let improvedType = entryType;
      if (ocrPassed) {
        ocrText = cleanKnownBadOcr(ocrText);
        improvedType = getImprovedType(entryType, ocrText);
      } else {
        console.log('OCR failed to recognize text for entry: ', ocrText, 'with confidence', ocrConfidence);
      }

      const details = collectTextDetails(ocrText);

      if (entryType === 'loopStart') {
        details[1].loopBreaks = doesLoopBreakOnError(entry);
        details[1].until = details[1].until || false;
      }

      entries.push({ line: i + 1, indent: indentLevel, type: improvedType, ocrPassed, text: ocrText, details });
    } else {
      entries.push({ line: i + 1, indent: indentLevel, type: entryType });
    }
  }

  return entries;
};

(async () => {
  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng');

  let inputResolve;
  const fileInputPromise = new Promise(res => inputResolve = res);
  let imgResolve;
  const imgLoadPromise = new Promise(res => imgResolve = res);

  scriptImg = document.createElement('img');
  scriptImg.onload = () => imgResolve()

  const fileInput = document.getElementById('fileInput');
  
  fileInput.onchange = function () {
    const fileReader = new FileReader();
    output.innerHTML = "Processing...";
    fileReader.onload = () => {
      scriptImg.src = fileReader.result;
      inputResolve();
    }

    fileReader.readAsDataURL(this.files[0]);
  }

  await Promise.all([fileInputPromise, imgLoadPromise]);

  canvas.width = scriptImg.width;
  canvas.height = scriptImg.height;
  canvas.getContext('2d').drawImage(scriptImg, 0, 0, scriptImg.width, scriptImg.height);
  const data = canvas.getContext('2d').getImageData(0, 0, scriptImg.width, scriptImg.height).data;

  lineLength = scriptImg.width * 4;
  entryLength = lineLength * entryHeight;

  const results = await parseScriptImage(data);
  // const str = JSON.stringify(results);
  // const testPass = tests[image] === str;

  // console.log(results);

  const commands = convertResultsToTemplateCommands(results);
  console.log(commands);

  output.innerHTML = commands;

  // console.log('Test', image, testPass ? 'Passed!' : 'Failed!');
  // if (!testPass) {
  //   console.log(str);
  // }

  // console.log('All images processed.');
})();

function convertResultsToTemplateCommands(results){
  let template = '';

  for (const entry of results) {
    let value = false;
    switch (entry.type) {
      case 'loopStart':
        template += `<br/>{{loop${getLoopType(entry)}`;
        if (entry.details[1] && entry.details[1].loopBreaks) {
          template += `|fail=`;
        }
        if (entry.details[1]) {
          if (entry.details[1].until) {
            if (entry.details[1].not) {
              template += `|not=`
            }
            if (entry.details[1].empty) {
              template += `|empty=`
            }
          }
        }

        template += `|commands=`
        break;
      case 'loopEnd':
        template += `}}`
        break;
      case 'find':
      case 'set':
      case 'engage':
      case 'move':
      case 'add':
      case 'take':
      case 'pickup':
        value = true;
      case 'shout':
      case 'use':
      case 'disengage':
      case 'recharge':
      case 'cycleup':
      case 'cycledown':
      case 'retrieve':
      case 'stow':
      case 'swap':
      case 'drop':
      case 'wait':
        template += `<br/>{{Command|type=${entry.type}${value?`|value=${entry.details[0]}`:''}}}`;
        break;
    }
  }

  return template;
}

function collectTextDetails(text) {
  if (text.startsWith('Move to')) return [text.replace('Move to ', ''), false];
  if (text.startsWith('Add to')) return [text.replace('Add to ', ''), false];
  if (text.startsWith('Take from')) return [text.replace('Take from ', ''), false];
  if (text.startsWith('Pick up')) return [text.replace('Pick up ', ''), false];
  if (text.startsWith('Engage')) return [text.replace('Engage ', ''), false];
  if (text.startsWith('Set Output To')) return [text.replace('Set Output To ', ''), false];
  if (text.startsWith('Find nearest')) return [text.replace('Find nearest ', '').replace(/ in$/, ''), false];
  // the `not` variations need to go first.
  if (text.startsWith('until') && text.endsWith('not full')) {
    return [
      text.replace(/^until /, '').replace(/ not full$/, ''),
      {
        until: true,
        empty: false,
        full: true,
        not: true,
      },
    ];
  }
  if (text.startsWith('until') && text.endsWith('full')) {
    return [
      text.replace(/^until /, '').replace(/ full$/, ''),
      {
        until: true,
        empty: false,
        full: true,
        not: false,
      },
    ];
  }
  if (text.startsWith('until') && text.endsWith('not empty')) {
    return [
      text.replace(/^until /, '').replace(/ not empty$/, ''),
      {
        until: true,
        empty: true,
        full: false,
        not: true,
      },
    ];
  }
  if (text.startsWith('until') && text.endsWith('empty')) {
    return [
      text.replace(/^until /, '').replace(/ empty$/, ''),
      {
        until: true,
        empty: true,
        full: false,
        not: false,
      },
    ];
  }
  return [text, false];
}

function getImprovedType(type, text) {
  if (type === 'pickupTakefromAddtoDrop') {
    if (text.startsWith('Pick')) return 'pickup';
    if (text.startsWith('Add')) return 'add';
    if (text.startsWith('Take')) return 'take';
    if (text.startsWith('Drop')) return 'drop';
  }

  if (type === 'stowCycleRetrieveSwap') {
    if (text.startsWith('Stow')) return 'stow';
    if (text.startsWith('Retrieve')) return 'retrieve';
    if (text.startsWith('Swap')) return 'swap';
    if (text.startsWith('Cycle')) {
      if (text.trim().endsWith('up')) return 'cycleup';
      else return 'cycledown';
    }
  }

  if (type === 'useHeldShoutSetOuputEngageDisengageRecharge') {
    if (text.startsWith('Use')) return 'use';
    if (text.startsWith('Shout')) return 'shout';
    if (text.startsWith('Set')) return 'set';
    if (text.startsWith('Engage')) return 'engage';
    if (text === 'Disengage') return 'disengage';
    if (text.startsWith('Recharge')) return 'recharge';
  }

  return type;
}

function cleanKnownBadOcr(text) {
  if (text === 'Dropall') return 'Drop all';
  if (text.startsWith('Find') && text.endsWith('in') && !text.endsWith(' in')) return text.replace(/in$/, ' in');

  return text;
}

function findMoveStructureButton(entry, color) {
  const endX = findEndOfEntry(entry);

  const x = endX - 21;
  const y = entryHeight - 11; 
  const width = 11;
  const height = 4;

  const area = getSubsetOfEntry(entry, x, y, width, height);

  return times(area.length / 4, i => {
    const pixel = [
      area[i * 4],
      area[i * 4 + 1],
      area[i * 4 + 2],
      area[i * 4 + 3]
    ];

    return arePixelsEqual(pixel, color);
  }).every(b => b === false)
}

function getSubsetOfEntry(entry, srcX, srcY, srcWidth, srcHeight) {
  return entry.filter((_, i) => {
    const px = Math.ceil((i + 1) / 4) - 1;
    const x = px % scriptImg.width;
    const y = (px / scriptImg.width) | 0;

    return x >= srcX && x < srcX + srcWidth && y >= srcY && y < srcY + srcHeight;
  });
}

function getEntry(data, rowNum) {
  return data.slice(entryLength * (rowNum - 1), (entryLength * (rowNum - 1)) + entryLength);
}

function identifyEntryType(entry, indentLevel) {
  const startX = indentLevel * indentWidth;

  // we grab all of these sections 31 pixels (x is 0-based. the value of 30 is actually pixel 31)
  // in from the left, as it's the most reliable spot to sample colors when considering loop
  // start/loop end intricacies, which are checked later.
  const topBorder = times(4, i => getPixelInEntry(startX + indentWidth, i, entry));
  const topBackground = getPixelInEntry(startX + indentWidth, 5, entry);

  const bottomBackground = getPixelInEntry(startX + indentWidth, entryHeight - entryBorderSize - 1, entry);
  const bottomBorder = times(4, i => getPixelInEntry(startX + indentWidth, entryHeight - entryBorderSize + i, entry));
  
  for (const [name, colorValues] of Object.entries(colors)) {
    const conditions = [];
    conditions.push(topBorder.map(p => arePixelsEqual(p, colorValues.lightBorder)));
    conditions.push(arePixelsEqual(topBackground, colorValues.background));
    conditions.push(arePixelsEqual(bottomBackground, colorValues.background));
    conditions.push(bottomBorder.map(p => arePixelsEqual(p, colorValues.darkBorder)));

    if (conditions.flat().every(b => b === true)) {
      if (name === 'loopWait') {
        // loops and wait share the same colors.
        // We need to distinguish these cases:
        //  - loop start
        //  - loop end
        //  - wait

        // we indent by 10 pixels into the start to avoid any rounded corner color pollution
        const topInnerBorder = times(4, i => getPixelInEntry(startX + 10, i, entry));
        const bottomInnerBorder = times(4, i => getPixelInEntry(startX + 10, entryHeight - entryBorderSize + i, entry));

        const topInnerIsBackground = topInnerBorder.map(p => arePixelsEqual(p, colorValues.background)).every(b => b === true);
        const bottomInnerIsBackground = bottomInnerBorder.map(p => arePixelsEqual(p, colorValues.background)).every(b => b === true);
        
        if (bottomInnerIsBackground && !topInnerIsBackground) {
          return `loopStart`;
        } else if (topInnerIsBackground && !bottomInnerIsBackground) {
          return 'loopEnd';
        } else {
          return 'wait';
        }
      } else if (name === 'useHeldShoutSetOuputEngageDisengageRecharge') {
        if (identifyShout(entry)) {
          return 'shout';
        } else {
          return name;
        }
      }

      return name;
    }
  }
}

function identifyShout(entry) {
  let endX = scriptImg.width - 1;

  while(endX > -1) {
    // first pixel that isn't black means that's the end of the entry.
    if(arePixelsEqual(getPixelInEntry(endX, 10, entry), colors.useHeldShoutSetOuputEngageDisengageRecharge.shoutBackground)){
      return true;
    }

    endX--;
  }

  return false;
}

function findEndOfLoopCondition(entry) {
  let endX = scriptImg.width - 1;

  while(endX > -1) {
    // first pixel that isn't black means that's the end of the entry.
    if(arePixelsEqual(getPixelInEntry(endX, 10, entry), colors.loopWait.conditionBackground)){
      return endX;
    }

    endX--;
  }
}

function findEndOfEntry(entry) {
  let endX = scriptImg.width - 1;

  while(endX > -1) {
    // first pixel that isn't black means that's the end of the entry.
    if(!arePixelsEqual(getPixelInEntry(endX, 10, entry), [0, 0, 0, 255])){
      return endX;
    }

    endX--;
  }
}

function doesLoopBreakOnError(entry) {
  const endX = findEndOfEntry(entry);

  if (endX === -1) {
    throw new Error('Unable to find end of entry. Something is terribly wrong');
  }

  return !arePixelsEqual(getPixelInEntry(endX - 16, 15, entry), [255, 255, 255, 255]);
}

function identifyEntryIndentLevel(entry) {
  let foundIndent = false;
  let indentCount = 0;
  let xOffset = 0;

  do {
    const conditions = [];
    // top light border
    conditions.push(times(entryBorderSize, i => arePixelsEqual(getPixelInEntry(xOffset + i, 0, entry), colors.loopWait.lightBorder)));
    // top background
    conditions.push(times(indentWidth - (entryBorderSize * 2), i => arePixelsEqual(getPixelInEntry(xOffset + i + entryBorderSize, 0, entry), colors.loopWait.background)));
    // top dark border
    conditions.push(times(entryBorderSize, i => arePixelsEqual(getPixelInEntry(xOffset + i + (indentWidth - entryBorderSize), 0, entry), colors.loopWait.darkBorder)));
    // bottom light border
    conditions.push(times(entryBorderSize, i => arePixelsEqual(getPixelInEntry(xOffset + i, entryHeight - 1, entry), colors.loopWait.lightBorder)));
    // bottom background
    conditions.push(times(indentWidth - (entryBorderSize * 2), i => arePixelsEqual(getPixelInEntry(xOffset + i + entryBorderSize, entryHeight - 1, entry), colors.loopWait.background)));
    // bottom dark border
    conditions.push(times(entryBorderSize, i => arePixelsEqual(getPixelInEntry(xOffset + i + (indentWidth - entryBorderSize), entryHeight - 1, entry), colors.loopWait.darkBorder)));

    if (conditions.flat().every(b => b === true)) {
      indentCount++;
      foundIndent = true;
      xOffset += 30;
    } else {
      foundIndent = false;
    }
  } while (foundIndent === true);

  return indentCount;
}

function arePixelsEqual(pixelOne, pixelTwo) {
  if (pixelOne[0] !== pixelTwo[0]) {
    return false;
  }
  if (pixelOne[1] !== pixelTwo[1]) {
    return false;
  }
  if (pixelOne[2] !== pixelTwo[2]) {
    return false;
  }
  // don't need to care about transparency. Bot scripts don't contain any transparent pixels.
  return true;
}

function times(count, cb) {
  return (new Array(count)).fill(0).map((_, i) => cb(i));
}

function getPixelInEntry(x, y, entry) {
  const start = y * lineLength + (x * 4);
  const end = start + 4;
  return entry.slice(start, end);
}

function getLoopType(entry) {
  const text = entry.details[0];
  switch(text) {
    default: return `|type=?|label=${text}`;
    case 'forever!': return ''; // Loop template defaults to "forever"
    case 'backpack':
    case 'hands':
    case 'held object': return `|type=${text}`;
    case 'times':
    case 'hear': return `|type=${text}|input=`; // TODO: input (eventually)
    case 'until hear': return `|type=hear|input=`; // TODO: input (eventually)
  }
}
