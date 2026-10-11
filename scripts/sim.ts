// Smoke test: simulate a full game against the AI using the real store.
import { useGameStore, canPlayAt, sideTotal } from '../src/game/store';

const s = () => useGameStore.getState();

// Build a deck and start the match.
s().autoFillDeck();
s().startMatch();

let guard = 0;
const trace: string[] = [];

while (s().phase !== 'game-end' && guard++ < 2000) {
  const st = s();
  if (st.phase === 'player-turn') {
    // Play a card if we have one and a valid location exists, else Next/Pass.
    const hand = st.player.hand;
    let played = false;
    if (hand.length > 1) {
      for (let hi = 0; hi < hand.length && !played; hi++) {
        for (let li = 0; li < 3 && !played; li++) {
          if (canPlayAt(st, 'player', hand[hi].def, li)) {
            st.selectCard(hi);
            st.playAtLocation(li);
            played = true;
          }
        }
      }
    }
    if (!played) {
      if (hand.length <= 1) s().pass();
      else s().next();
    }
  } else if (st.phase === 'ai-turn') {
    st.aiStep();
  } else if (st.phase === 'round-end') {
    trace.push(
      `round ${st.round} done: crowns ${st.crowns.player}-${st.crowns.ai}, totals p=${st.locations.map((_, i) => sideTotal(st, i, 'player')).join('/')} a=${st.locations.map((_, i) => sideTotal(st, i, 'ai')).join('/')}`,
    );
    s().nextRound();
  }
}

console.log(trace.join('\n'));
console.log('iterations:', guard);
console.log('final phase:', s().phase);
console.log('gameWinner:', s().gameWinner);
console.log('rounds played:', s().roundResults.length);
console.log('playerHand:', s().player.hand.length, 'aiHand:', s().ai.hand.length);
console.log('playerDeck:', s().player.deck.length, 'aiDeck:', s().ai.deck.length);
if (s().phase !== 'game-end') {
  console.log('FAIL: game did not terminate');
  process.exit(1);
}
console.log('PASS');
