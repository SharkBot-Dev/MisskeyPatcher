// Restore the board from Misskey's map and serialized move history.
export function restoreReversi(game) {
  if (!Array.isArray(game.map) || !game.map.length || !game.map.every(row => typeof row === 'string' && row.length === game.map[0].length) || !Array.isArray(game.logs)) throw new Error('Unsupported game data');
  const width = game.map[0].length, height = game.map.length;
  if (!width || width * height > 4096) throw new Error('Unsupported map');
  const board = [...game.map.join('')].map(cell => cell === 'b' ? true : cell === 'w' ? false : cell === '-' ? null : undefined);
  const effects = (color, origin) => {
    const result = [];
    for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
      let x = origin % width, y = Math.floor(origin / width);
      const line = [];
      for (let step = 0; step < width * height; step++) {
        x += dx; y += dy;
        if (game.loopedBoard) { x = (x + width) % width; y = (y + height) % height; }
        if (x < 0 || y < 0 || x >= width || y >= height) break;
        const pos = y * width + x;
        if (pos === origin && game.loopedBoard) { result.push(...line); break; }
        if (board[pos] == null) break;
        if (board[pos] === color) { result.push(...line); break; }
        line.push(pos);
      }
    }
    return [...new Set(result)];
  };
  const moves = color => board.flatMap((cell, pos) => cell === null && (game.canPutEverywhere || effects(color, pos).length) ? [pos] : []);
  let turn = moves(true).length ? true : moves(false).length ? false : null;
  for (const log of game.logs) {
    const color = Array.isArray(log) ? log[1] === 1 : log.player;
    const operation = Array.isArray(log) ? log[2] : log.operation;
    const pos = Array.isArray(log) ? log[3] : log.pos;
    if ((operation !== 0 && operation !== 'put') || color !== turn || !Number.isInteger(pos) || !moves(color).includes(pos)) throw new Error('Unsupported move history');
    const flipped = effects(color, pos);
    board[pos] = color;
    for (const cell of flipped) board[cell] = color;
    turn = moves(!color).length ? !color : moves(color).length ? color : null;
  }
  return { board, width, height, turn, moves: turn === null ? [] : moves(turn) };
}
