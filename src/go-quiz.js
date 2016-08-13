/*
 * Copyright 2016 Arthur Liao
 * MIT License
 *
 * Go Game Quiz
 * A Twincl plugin for twinclet-go-quiz
 */

class GoGame {
  constructor(elem) {
    this.boardElem = elem || document.getElementById('board') || document.body.firstElementChild;
  }

  init() {
    if (window.parent === window) {
      document.body.innerHTML = '<h2>Go Quiz</h2>';
      return;
    }
    this.maximized = false;
    this.delayResize = true;

    TL.init(result => {
      this.lastMark = null;
      this.freezing = false;
      this.attempt = 0;
      this.elem = {main: document.getElementById('main'), comment: document.getElementById('comment')};
      this.elem.panel = document.getElementsByClassName('panel')[0];
      ['back', 'restart', 'hint', 'attempt'].forEach(s => this.elem[s] = document.getElementsByName(s)[0]);

      // Initialize game data
      this.data = result.item.data;
      this.kifu = WGo.SGF.parse(this.data);
      this.node = this.kifu.root;
      this.game = new WGo.Game();
      this.game.firstPosition();
      if (!this.node.setup && this.node.children.length === 1 && this.node.children[0].setup) {
        this.node = this.node.children[0];
        this.node.parent = null;
      }
      const firstChild = this.node.children[0];
      if (firstChild && firstChild.move) this.game.turn = firstChild.move.c;
      this.starter = this.game.turn;
      this.elem.attempt.innerHTML = this.starter === 'WGo.W' ? '○' : '●';
      this.hasCorrectStr = Boolean(this.data.match(/\bC\[(correct|right)\b/i));

      // Initialize the board
      const cuts = ((result.item.cut || '').match(/\d+/g) || [0, 0, 0, 0]).map(n => +n);
      this.xsize = 19.5 - cuts[1] - cuts[3];
      this.updateBoard();
      this.board = new WGo.Board(this.boardElem, {
        width: this.width,
        section: {top: cuts[0], right: cuts[1], bottom: cuts[2], left: cuts[3]},
        font: 'Arial'
      });
      if (this.node.setup) {
        this.node.setup.forEach(stone => {
          this.game.addStone(stone.x, stone.y, stone.c);
          this.board.addObject(stone);
        });
      }
      this.updatePanel();
      this.updateBoard(); // the board height is available
      this.board.addEventListener('click', this.clickBoard.bind(this));

      window.onresize = this.onResize.bind(this);
      window.onkeyup = this.onKeyUp.bind(this);
      ['back', 'restart', 'hint'].forEach(s => this.elem[s].onclick = this.clickButton.bind(this));
    });
  }

  updateBoard(redraw) {
    const windowWidth = window.innerWidth;
    this.landscape = windowWidth > 160 + 40 * this.xsize;
    this.width = this.landscape ? Math.min(windowWidth - 160, 50 * this.xsize) : windowWidth;
    if (redraw && this.board) this.board.setWidth(this.width);
    const height = this.boardElem.scrollHeight;
    this.elem.main.className = this.landscape ? 'landscape' : 'portrait';
    this.elem.panel.style.cssText = this.landscape ? `height: ${height - 5}px` : `width: ${this.width}px`;
    this.elem.comment.style.cssText = this.landscape ? `height: ${height - 125}px` : `width: ${this.width - 150}px`;
    this.lastUpdateBoard = +new Date;
    if (this.board) TL.send({command: 'screen', height: document.body.firstElementChild.scrollHeight});
  }

  updatePanel() {
    this.elem.comment.innerHTML = this.node.comment || '';
    const atBeginning = this.game.stack.length <= 1;
    const atEnd = !this.node.children.length;
    const on = [!atBeginning, !atBeginning, !atEnd];
    ['back', 'restart', 'hint'].forEach((s, i) =>
        this.elem[s][on[i] ? 'removeAttribute' : 'setAttribute']('data-disabled', '1'));
  }

  setLastMark(mark) {
    if (this.lastMark) this.board.removeObject(this.lastMark);
    if (mark && !mark.type) mark.type = 'CR';
    if (mark) this.board.addObject(mark);
    this.lastMark = mark;
  }

  markResult(correct) {
    const {x, y} = this.node.move;
    this.setLastMark(correct ? {x, y, type: 'LB', text: '✓'} : {x, y, type: 'TR'});
    if (!correct) this.newAttempt();
  }

  removeCaptured(captured) {
    if (Array.isArray(captured)) {
      captured.forEach(stone => this.board.removeObjectsAt(stone.x, stone.y));
    }
  }

  newAttempt() {
    this.attempt++;
    this.elem.attempt.innerHTML = (this.attempt > 99 ? '' : '#') + this.attempt;
  }

  clickBoard(x, y) {
    if (this.freezing || !this.node.children.length) return;
    if (!this.attempt) this.newAttempt();

    // Match the move against child nodes
    const nextNode = this.node.children.filter(node => node.move.x === x &&
        node.move.y === y && node.move.c === this.game.turn)[0];
    if (!nextNode) {
      const label = {x, y, type: 'LB', text: '✕'};
      this.board.addObject(label);
      setTimeout(() => {
        this.board.removeObject(label);
        this.newAttempt();
      }, 500);
      return;
    }

    // Player move
    this.setLastMark({x, y});
    this.board.addObject({x, y, c: this.game.turn});
    const result = this.game.play(x, y);
    this.removeCaptured(result);
    this.node = nextNode;
    this.updatePanel();
    if (!this.node.children.length) {
      this.markResult(!this.hasCorrectStr || this.node.comment.match(/\b(correct|right)\b/i));
      return;
    }

    // Opponent move
    this.freezing = true;
    setTimeout(() => {
      this.freezing = false;
      this.node = nextNode.children[0];
      const {x, y} = this.node.move;
      this.updatePanel();
      this.setLastMark({x, y});
      this.board.addObject({x, y, c: this.game.turn});
      const result = this.game.play(x, y);
      this.removeCaptured(result);
      if (!this.node.children.length) this.markResult(false); // failed attempt
    }, 500);
  }

  static findAnswer(node, c) {
    return !node.children.length ? node.move.c === c : node.children.some(node => GoGame.findAnswer(node, c));
  }

  back() {
    const p1 = this.game.popPosition();
    const p2 = this.game.getPosition();
    const size = p1.size;
    for (let i = 0; i < size * size; i++) {
      if ((p1.schema[i] === p2.schema[i])) continue;
      const [x, y] = [Math.floor(i / size), i % size];
      if (p1.schema[i] && !p2.schema[i]) this.board.removeObjectsAt(x, y);
      else if (!p1.schema[i] && p2.schema[i]) this.board.addObject({x, y, c: p2.schema[i]});
    }
    this.node = this.node.parent;
  }

  clickButton(e) {
    e.preventDefault();
    switch (e.target.name) {

      case 'hint': 
        if (!this.node.children.length) return;
        const hintNode = this.node.children.filter(node => GoGame.findAnswer(node, this.starter))[0];
        const obj = hintNode ? hintNode.move :
          {x: this.node.move.x, y: this.node.move.y, type: 'LB', text: '✕'};
        this.board.addObject(obj);
        this.newAttempt();
        setTimeout(() => this.board.removeObject(obj), 1000);
        break;

      case 'back': 
        if (!this.node.parent) return;
        this.setLastMark();
        this.back();
        if (this.game.turn !== this.starter) this.back();
        if (this.node.move) this.setLastMark({x: this.node.move.x, y: this.node.move.y});
        this.updatePanel();
        break;

      case 'restart': 
        this.setLastMark();
        while (this.node.parent) {
          this.back();
        }
        this.updatePanel();
        break;
    }
  }

  onResize(e) {
    if (this.lastUpdateBoard > +new Date - 150) {
      return; // workaround to ignore the iOS Safari resize event triggered by this.updateBoard();
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.updateBoard(true);
      this.timer = null;
    }, this.delayResize ? 300 : 0);
    this.delayResize = true;
  }

  toggleFullScreen() {
    this.maximized = !this.maximized;
    this.delayResize = false;
    TL.send({command: 'screen', state: this.maximized ? 'full' : 'normal'});
  }

  onKeyUp(e) {
    if (this.maximized && e.keyCode === 27) {
      this.toggleFullScreen();
    }
  }
}

window.onload = function () { new GoGame().init(); }

