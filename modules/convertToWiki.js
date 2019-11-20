function convert(results){
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

function getLoopType(entry) {
  const text = entry.details[0];
  switch(text) {
    default: return `|type=?|value=${text}`;
    case 'forever!': return ''; // Loop template defaults to "forever"
    case 'backpack':
    case 'hands':
    case 'held object': return `|type=${text}`;
    case 'times':
    case 'hear': return `|type=${text}|input=`; // TODO: input (eventually)
    case 'until hear': return `|type=hear|input=`; // TODO: input (eventually)
  }
}

export default convert;
