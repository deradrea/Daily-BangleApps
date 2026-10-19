class Graphics {
  constructor() { this.commands = []; this.color = '#ffffff'; this.bg = '#000000'; this.size = 12; this.align = -1; }
  getWidth() { return 176; } getHeight() { return 176; }
  reset() { return this; }
  setColor(color) { this.color = color; return this; }
  setBgColor(bg) { this.bg = bg; return this; }
  setFont(_name, size) { this.size = size; return this; }
  setFontAlign(align) { this.align = align; return this; }
  stringWidth(value) { return String(value).length * this.size * 0.55; }
  clear() { this.commands = [{type: 'clear', color: this.bg}]; return this; }
  add(type, args) { this.commands.push({type, args, color: this.color}); return this; }
  fillRect(...args) { return this.add('fillRect', args); }
  drawRect(...args) { return this.add('drawRect', args); }
  fillCircle(...args) { return this.add('fillCircle', args); }
  fillPoly(...args) { if (args[0].length>128) throw Error('Maximum number of points (64) exceeded for fillPoly'); return this.add('fillPoly', args); }
  drawPoly(...args) { return this.add('drawPoly', args); }
  drawString(text, x, y) { this.commands.push({type: 'text', args: [text,x,y], color: this.color, size: this.size, align: this.align}); return this; }
}
module.exports = {Graphics};
