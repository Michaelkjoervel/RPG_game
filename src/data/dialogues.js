// LUMENFALL — dialogue content. Every id referenced by npcs.js selectors, game/story.js
// scenes, and zone shard interactables (see docs/CONTRACTS_ADDENDUM.md's pinned lore ids)
// lives here. See docs/ARCHITECTURE.md §NPCs/dialogue/quests for the DIALOGUES schema:
//   { id, lines: [ {speaker, text, portrait?, choices?:[{text, goto|flag|fn}]} ] }
// `speaker` may be an NPC id (resolves name+portrait via data/npcs.js), a display name, or
// '' for narration. '{player}' substitutes G.playerName. Lines are short on purpose — the
// bible's voice is warm, wondrous, a little melancholy; fragments, not lore-dumps.
//
// Two small builders keep the many short, single-purpose lines terse without losing clarity:
//   one(speaker, text)                     -> a single-line dialogue's `lines` array
//   ambient(prefix, speaker, {a:[..], b:[..]})  -> registers `${prefix}_a1..a2` / `_b1..b2`
//     (era "a" = before the shrine-shard theft, era "b" = after — see npcs.js#storyStage)

const one = (speaker, text) => ({ lines: [{ speaker, text }] });
const many = (speaker, texts) => ({ lines: texts.map((text) => ({ speaker, text })) });

function ambientInto(target, prefix, speaker, eras) {
  for (const era of Object.keys(eras)) {
    eras[era].forEach((text, i) => { target[`${prefix}_${era}${i + 1}`] = one(speaker, text); });
  }
}

const D = {};

// =========================================================================== Intro / tutorial
D.dlg_intro_1 = many('Elder Maren', [
  'So — the old dreams have chosen a day to come calling, have they?',
  'You\'ve felt it since sunup, I\'d wager. That pull toward the sanctum stair.',
  'Three Kindred rest below: hatchlings, waiting on someone to answer them back.',
  'Go on, {player}. Go and see who answers you.',
]);
D.dlg_intro_2 = many('Elder Maren', [
  'There — do you feel that? A thread, drawn taut between two hearts.',
  'Ashe will want to see. They always do.',
]);
D.dlg_ashe_tutorial_pre = many('Ashe', [
  'Wait, you already chose?! No fair, I wanted first look—',
  'Fine. Fine! Spar me for it. Winner brags for a week.',
]);
D.dlg_ashe_tutorial_post = one('Ashe', 'Not bad, {player}. Not bad at all. This is going to be fun.');
D.dlg_intro_3 = many('Elder Maren', [
  'Go on then, the two of you — the road doesn\'t wait for either of you.',
  'And {player} — mind the gate east. Dawnmeadow\'s gentler than most, but the world rarely is.',
]);

// ========================================================================================= Maren
D.dlg_maren_ambient = one('Elder Maren', 'The sanctum\'s quieter without you underfoot. Good quiet, mind.');
D.dlg_maren_progress = one('Elder Maren', 'Every Sigil you carry is a promise kept, {player}. I notice.');
D.dlg_maren_injured = one('Elder Maren', 'I\'m well enough — a graze, no more. It\'s the shard I mourn, not my arm.');
D.dlg_maren_postgame = one('Elder Maren', 'The light\'s coming back into my garden. I\'d almost forgotten that color.');

// ========================================================================================== Ashe
D.dlg_ashe_pre_1 = many('Ashe', [
  'Bramwell\'s Sigil, already? Ha — I\'ll have mine and yours both by moonrise.',
  'Come on then, let\'s see if that first win was luck.',
]);
D.dlg_ashe_win_1 = one('Ashe', '...Okay. Okay! That was NOT luck. Rematch. Someday. Not today.');
D.dlg_ashe_loss_1 = one('Ashe', 'Ha! Still got it. Don\'t sulk, {player}, it\'s a bad look on you.');

D.dlg_ashe_pre_2 = many('Ashe', [
  'Hey. You — you saw it too, right? In the wood. Tell me you saw it.',
  'I keep telling myself it doesn\'t change anything. Doesn\'t feel true yet. Fight me, it\'ll clear my head.',
]);
D.dlg_ashe_win_2 = one('Ashe', 'Thanks. I mean it. I needed that more than I needed to win.');
D.dlg_ashe_loss_2 = one('Ashe', 'Ha — see, some things don\'t change. Feels good to laugh again.');

D.dlg_ashe_vess_glimpse = many('', [
  'Ashe, talking with someone in gray, low-voiced, near the crystal wall. They straighten when they see you.',
]);
D.dlg_ashe_vess_glimpse.lines.push({ speaker: 'Ashe', text: 'Oh — hey. That was nobody. Just... someone with an interesting offer. I said no. Mostly.' });

D.dlg_ashe_pre_3 = many('Ashe', [
  'They said the Order could make me strong enough to matter. Fast. No years of walking and bonding.',
  'I didn\'t say yes. I just... didn\'t say no fast enough. Fight me — I need to remember why.',
]);
D.dlg_ashe_win_3 = one('Ashe', 'There it is. That\'s why. Thanks for the reminder, {player}.');
D.dlg_ashe_loss_3 = one('Ashe', '...Maybe they had a point. No — no, forget I said that.');

D.dlg_ashe_pre_4 = many('Ashe', [
  'Vess keeps finding me. I keep not walking away fast enough.',
  'I\'m not one of them. I\'m NOT. Prove it with me — one more fight, like old times.',
]);
D.dlg_ashe_win_4 = one('Ashe', 'Old times. Yeah. I\'d like more of those, actually.');
D.dlg_ashe_loss_4 = one('Ashe', 'Still losing to you. Some things are allowed to stay the same.');

D.dlg_ashe_pre_5 = many('Ashe', [
  'I\'m done wavering, {player}. Whatever\'s through that door, I\'m at your side, not behind you.',
  'One last spar, for luck. Then let\'s go end this together.',
]);
D.dlg_ashe_win_5 = one('Ashe', 'Good. You\'ll need every edge you\'ve got in there. Go — I\'ve got your back.');
D.dlg_ashe_loss_5 = one('Ashe', 'Ha! Fine, FINE, you\'ve earned the last word. Now let\'s go.');
D.dlg_ashe_epilogue = one('Ashe', 'Turns out being someone\'s rival was never the hard part, {player}. Being their friend was.');

// ===================================================================================== Pip / villagers (Brighthollow)
ambientInto(D, 'dlg_pip', 'Pip', {
  a: ['Fresh charms, fresh bread, fresh gossip — pick your poison!', 'You\'ve the look of someone about to make my week interesting.'],
  b: ['Keep the shop lit till you\'re back safe, {player}. That\'s the deal.', 'Heard about the shrine. Bad business. You\'ll set it right, I know it.'],
});
ambientInto(D, 'dlg_vbh1', 'Old Wick', {
  a: ['Water\'s sweet from this well. Has been since I was a boy.', 'Mind the east road at dusk — nothing\'s ever there, but still.'],
  b: ['Even the well tastes different since the shard went missing. Or maybe that\'s just me.', 'Come back safe, will you? Town\'s smaller with you gone.'],
});
ambientInto(D, 'dlg_vbh2', 'Bea Thorne', {
  a: ['My berries are in! Best batch in three summers.', 'You\'ve got a Kindred already? Lucky thing. Or brave thing.'],
  b: ['Grew a whole new flowerbed since the trouble started. Felt like the thing to do.', 'Maren says it\'ll be alright. I believe her more than I believe most.'],
});
ambientInto(D, 'dlg_vbh3', 'Corran Vale', {
  a: ['I watch the east road most days. Something\'s always about to happen out there.', 'Off to Dawnmeadow? Give the meadow my regards.'],
  b: ['Watched a lot more roads since the shard went. Can\'t help it now.', 'Word is you\'re chasing Sigils. Good. Somebody should.'],
});
ambientInto(D, 'dlg_vbh4', 'Nettie Fenn', {
  a: ['South lane\'s quiet today. I like it quiet.', 'You look like trouble\'s about to find you. Good luck to it.'],
  b: ['Quiet doesn\'t feel the same anymore. I miss the old kind.', 'Bring the shard home, {player}. We\'ll keep the lamps lit till you do.'],
});

// =================================================================================== Dawnmeadow
D.dlg_bramwell_greet = many('Keeper Bramwell', [
  'So. A Warden-initiate, this far from Brighthollow already. Bramwell\'s the name — Terra\'s the trial.',
  'Prove your bond\'s worth more than your nerve, and the first Sigil is yours.',
]);
D.dlg_bramwell_win = many('Keeper Bramwell', [
  'Well fought. Terra doesn\'t yield easy, and neither did you.',
  'Wear this Sigil like it means something. It does.',
]);
D.dlg_bramwell_loss = one('Keeper Bramwell', 'Not yet — and that\'s alright. Terra rewards patience more than speed. Come back when you\'re ready.');
D.dlg_bramwell_after = one('Keeper Bramwell', 'The meadow\'s calmer with a Sigil-bearer in it. Walk well, {player}.');

// =================================================================================== Whisperwood
D.dlg_liora_greet = many('Keeper Liora', [
  'You\'ve the shrine-light in your step already. Liora, keeper of this glade. Bloom and Lumen answer to me.',
  'Let\'s see if your bond holds under real light.',
]);
D.dlg_liora_win = many('Keeper Liora', [
  'Beautiful. That\'s not a word I use for battles often.',
  'The second Sigil is yours — and earned, not given.',
]);
D.dlg_liora_loss = one('Keeper Liora', 'The glade forgives a first loss easily. Come back when your bond\'s grown a little deeper.');
D.dlg_liora_after = one('Keeper Liora', 'The light-shafts are calmer since you passed the trial. I think they approve of you.');
D.dlg_liora_dapplyn_active = one('Keeper Liora', 'Still no sign of her? She bolted toward the falls, last I saw. Keep an eye out, would you?');
D.dlg_liora_dapplyn_found = many('', [
  'A dapplyn freezes at the tree-line, light-spots skittering over her hide like startled fireflies — then she bounds straight to you.',
]);
D.dlg_liora_dapplyn_found.lines.push(
  { speaker: 'Keeper Liora', text: '...There you are. I was starting to fear the worst.' },
  { speaker: 'Keeper Liora', text: 'Thank you, {player}. Take this — I\'ve had little use for it, and I think it wants a longer road than mine.' },
);

D.dlg_syl_intro = many('Herbalist Syl', [
  'Oh — a Warden! Perfect timing. My tonic stores are thin and my patients aren\'t getting less hurt.',
  'Bring me three Tonics and I\'ll teach you something worth knowing. Deal?',
]);
D.dlg_syl_active = one('Herbalist Syl', 'Three Tonics, remember — for the patients, not for glory.');
D.dlg_syl_turnin = one('Herbalist Syl', 'You\'ve got them? Wonderful — hand them over, and let me show my thanks.');
D.dlg_syl_done = one('Herbalist Syl', 'My patients sleep easier thanks to you. That\'s worth more than glim, though I gave you some of that too.');

// ================================================================================== Gloamcavern
D.dlg_ode_intro = many('Lanternkeeper Ode', [
  'The dark past this point doesn\'t care for torches — burns too fast, gives you away. Lantern oil\'s slower, safer.',
  'Mine\'s run dry. If you find a bottle at Pip\'s in Brighthollow, I\'d be in your debt.',
]);
D.dlg_ode_active = one('Lanternkeeper Ode', 'Still dry down here. Pip\'s shop, remember — lantern oil.');
D.dlg_ode_turnin = one('Lanternkeeper Ode', 'That\'s the stuff. Slow burn, steady light. Thank you, truly.');
D.dlg_ode_done = one('Lanternkeeper Ode', 'The dark\'s a little less dark on my watch now. You did that.');

D.dlg_finn_intro = {
  lines: [
    { speaker: '', text: 'A gray-robed figure flinches at your approach, hand half-raised — then lowers it, exhausted.' },
    { speaker: 'Finn', text: 'Please — I\'m not with them anymore. Haven\'t been for weeks. I just need somewhere quiet to disappear.' },
    {
      speaker: 'Finn', text: 'You could report me. Or you could just... not. Your choice, Warden.',
      choices: [
        { text: 'Help him disappear.', flag: 'finn_helped' },
        { text: 'Say the Order should know where he is.', flag: 'finn_reported' },
      ],
    },
  ],
};
D.dlg_finn_after_help = one('Finn', 'Still here. Still grateful. You didn\'t have to look the other way, but you did.');
D.dlg_finn_after_report = one('Finn', '...Word travels fast, even down here. I\'m still packing. Please, just — go.');

D.dlg_gloam_ambush_intro = {
  lines: [
    { speaker: '', text: 'Two gray-robed shapes step from the crystal dark, masks catching the glow.' },
    { speaker: 'Seeker', text: 'The shrine-shard travels with careless company. We\'ll relieve you of the burden of guarding it.' },
  ],
};
D.dlg_seeker_a_taunt = one('Seeker', 'Hand over anything shining and this ends quickly.');
D.dlg_seeker_a_lose = one('Seeker', 'Impossible. The Archon said commons couldn\'t—');
D.dlg_seeker_a_after = one('Seeker', '...We\'ll remember this, Warden.');
D.dlg_gloam_ambush_between = {
  lines: [
    { speaker: '', text: 'The second Seeker steps over their fallen partner without a glance.' },
    { speaker: 'Seeker', text: 'One down. I won\'t be so careless.' },
  ],
};
D.dlg_seeker_b_taunt = one('Seeker', 'You\'ll not leave this cave with the shard, or with much else.');
D.dlg_seeker_b_lose = one('Seeker', 'No — the shard, I dropped—');
D.dlg_seeker_b_after = one('Seeker', '...The Archon will hear of this.');
D.dlg_gloam_ambush_after = many('', [
  'Among the scattered gear, a familiar glint: Brighthollow\'s shrine-shard, cracked but whole.',
]);

// ================================================================================== Mirrorlake
D.dlg_maro_greet = many('Keeper Maro', [
  'Maro, ferryman turned Keeper, though I still smell of fish more than starlight. Tide answers when I call.',
  'Let\'s see if your bond can hold water. Ha — sorry. Let\'s just fight.',
]);
D.dlg_maro_win = many('Keeper Maro', [
  'Ha! Good — real good. The lake itself would\'ve approved.',
  'Third Sigil. Wear it like the tide: patient, and unstoppable.',
]);
D.dlg_maro_loss = one('Keeper Maro', 'The tide always comes back around. So will you, when you\'re ready.');
D.dlg_maro_after = one('Keeper Maro', 'Lake\'s calmer with you passing through, {player}. Good travels.');

D.dlg_juno_intro = many('Ferryman Juno', [
  'That ferry\'s been sunk since the Order came through, gear and all, lost in that cave somewhere.',
  'If you happen across a tangle of rope and block down there, I\'d love it back.',
]);
D.dlg_juno_active = one('Ferryman Juno', 'Still searching, eh? It\'s in there somewhere, I\'d bet my boots on it.');
D.dlg_juno_turnin = one('Ferryman Juno', 'That\'s my ferry gear! Every knot, every block — you found it all.');
D.dlg_juno_done = one('Ferryman Juno', 'She\'ll sail again by week\'s end. Come by anytime — free crossing, always, for you.');

ambientInto(D, 'dlg_wren', 'Wren', {
  a: ['Driftmoor\'s stock beats Brighthollow\'s, and I\'ll fight anyone who says otherwise.', 'Charms, stones, stranger things — Wren\'s got it, if it\'s worth having.'],
  b: ['Trouble\'s reached even here. Good thing I stock more than tonics.', 'Buy something, sell something, survive something — that\'s Driftmoor for you lately.'],
});
D.dlg_wren_gleam_found = {
  lines: [
    {
      speaker: 'Wren', text: 'Wait — is that— that\'s a GLEAMING Kindred?! I\'ll pay 1500 glim on the spot, no haggling. Please.',
      choices: [
        { text: 'Sell the gleaming Kindred for 1500 glim.', flag: 'sq_gleam_sold' },
        { text: 'Not for sale.' },
      ],
    },
  ],
};
D.dlg_wren_after = one('Wren', 'Still can\'t believe you had a gleaming one. Best trade of my life.');
ambientInto(D, 'dlg_vdm1', 'Tam Kell', {
  a: ['Best fishing spot on the whole lake, right off this dock.', 'Driftmoor\'s small, but it\'s ours.'],
  b: ['Keep half an eye on the water lately. Something\'s stirring under the calm.', 'Glad someone\'s out there setting things right.'],
});
ambientInto(D, 'dlg_vdm2', 'Ressa Quill', {
  a: ['Mind the lilypads, they\'re stickier than they look.', 'You\'ve got that Warden look about you already.'],
  b: ['The lake\'s been strange since the Order came through. Quieter, almost.', 'Go on, then. Mirrorlake\'s rooting for you.'],
});

// ===================================================================================== Skyreach
D.dlg_sera_greet = many('Keeper Sera', [
  'Storm\'s been screaming since the Dimming worsened. Sera. Gale and Volt, and no patience for the faint-hearted.',
  'Weather this trial like you mean it, or don\'t weather it at all.',
]);
D.dlg_sera_win = many('Keeper Sera', [
  'HA! Now THAT\'S a Warden. The storm agrees — listen to it cheer.',
  'Fourth Sigil, earned in the teeth of the wind. Wear it proud.',
]);
D.dlg_sera_loss = one('Keeper Sera', 'The wind\'s not done testing you. Neither am I. Come back stronger.');
D.dlg_sera_after = one('Keeper Sera', 'The storm\'s finally quieting. Didn\'t think I\'d live to see it, honestly.');

D.dlg_bo_intro = many('Climber Bo', [
  'There\'s a stratovane pair gone half-feral on the high ledge, spooked and dangerous. Scared they\'ll hurt themselves.',
  'Could use a hand driving them off before they fall. Two passes ought to do it.',
]);
D.dlg_bo_wait1 = one('Climber Bo', 'First pass down, one more to go — they\'re still up there, still scared.');
D.dlg_bo_wait2 = one('Climber Bo', 'Almost there. One more push and they\'ll settle.');
D.dlg_bo_done = one('Climber Bo', 'Both calm now, both safe. Couldn\'t have done it without you, truly.');
D.dlg_bo_pass1 = many('Climber Bo', ['There! Get them away from the ledge, careful now!']);
D.dlg_bo_pass2 = many('Climber Bo', ['Last one — steady, {player}, steady!']);

// ================================================================================ Sunken Ruins
D.dlg_ruins_revelation = many('', [
  'Half-drowned halls, columns cracked open like fruit — and on every wall, the same story, told a hundred ways.',
  'The Lumen did not merely fall. It was fleeing something. And whatever chased it down... may still be hungry.',
]);
D.dlg_imre_intro = many('Scholar Imre', [
  'These murals predate the Sunken temple\'s own foundations, I\'d wager. Fascinating, if you have the patience.',
  'Talk to me about them a few times — I promise it\'s worth your while.',
]);
D.dlg_imre_mural_1 = one('Scholar Imre', 'This first panel: a star, whole and burning, ringed by a hundred smaller lights reaching toward it like open hands.');
D.dlg_imre_mural_2 = one('Scholar Imre', 'Second panel — the shattering. See how the light scatters? That\'s every heartspark, seeded at once.');
D.dlg_imre_mural_3 = one('Scholar Imre', 'Third panel troubles me. A hand, reaching for a shard — and the shard reaching back. Hungrily.');
D.dlg_imre_after = one('Scholar Imre', 'Three panels, one true story: the Lumen didn\'t just fall. Something tried to take it back. Thank you for your patience.');

D.dlg_sancturne_pre = many('Sancturne', [
  'A cracked reliquary urn hums on its dais, and within it, something ancient stirs awake.',
]);
D.dlg_sancturne_pre.lines.push({ speaker: 'Sancturne', text: '...Another hand, reaching for what isn\'t harvest. Prove it, then. Prove you mean to bond, not take.' });
D.dlg_sancturne_join = {
  lines: [
    { speaker: '', text: 'The urn splits open like a seed. What steps free is smaller than the legend, and far more curious.' },
    { speaker: 'Sancturne', text: '...Warden. Yes. I remember this shape of trust. I\'ll walk with you, if you\'ll have me.' },
  ],
};
D.dlg_seeker_c_taunt = one('Seeker', 'The Ruins are sealed to outsiders. Turn back, or be turned back.');
D.dlg_seeker_c_lose = one('Seeker', 'Impossible — the wards should have—');
D.dlg_seeker_c_after = one('Seeker', '...This changes nothing.');

// =================================================================================== Hollow Spire
D.dlg_spire_arrival = many('', [
  'The Hollow Spire rises out of the ruin-line like a blade planted hilt-down — cold geometry, banners the color of old ash.',
  'Somewhere above, Archon Sol is waiting. He has been waiting a long time.',
]);
D.dlg_vess_greet = one('Lieutenant Vess', 'Vess. I don\'t waste words, so I won\'t waste them on you: stand aside, or don\'t stand at all.');
D.dlg_vess_win = one('Lieutenant Vess', '...Adequate. Frost doesn\'t forget a defeat easily. Neither do I.');
D.dlg_vess_loss = one('Lieutenant Vess', 'Predictable. Retreat and train, little Warden. You\'ll need both.');
D.dlg_vess_after = one('Lieutenant Vess', 'We\'re not finished, you and I. Not yet.');

D.dlg_dorn_greet = one('Lieutenant Dorn', 'HA! A challenger! Dorn\'s the name, and I haven\'t lost a good fight in ages — don\'t disappoint me!');
D.dlg_dorn_win = one('Lieutenant Dorn', 'HAHA! Finally, a REAL fight! You\'ve got my respect, Warden, rare as that is.');
D.dlg_dorn_loss = one('Lieutenant Dorn', 'Ha! Come back when you\'ve got more fire in you! I\'ll be here, probably eating.');
D.dlg_dorn_after = one('Lieutenant Dorn', 'Still smiling about that fight, honestly. Go on, you\'ve got bigger trouble ahead.');

D.dlg_seeker_d_taunt = one('Seeker', 'The Spire doesn\'t welcome guests. It only remembers intruders.');
D.dlg_seeker_d_lose = one('Seeker', 'No — I failed him—');
D.dlg_seeker_d_after = one('Seeker', 'The Archon anticipated this. Somewhat.');

D.dlg_sol_not_ready = one('Archon Sol', 'You\'re not ready. Vess and Dorn stand between us for a reason — prove yourself against them first.');
D.dlg_sol_greet = many('Archon Sol', [
  'So. The Warden who rekindles instead of harvests. I\'ve heard the reports. I don\'t quite believe them, yet.',
  'I don\'t hate you, understand. I simply believe you\'re wrong, and the world can\'t afford wrong, not anymore.',
]);
D.dlg_sol_interlude = one('Archon Sol', 'Rest, if you must. Vantash is patient. So am I — for now.');
D.dlg_sol_phase1_win = many('Archon Sol', [
  '...Formidable. But you haven\'t seen what conviction can build.',
  'Behold — a Firstborn, remade. Thalassyr will not resist me. It cannot, anymore.',
]);
D.dlg_sol_phase2_pre = {
  lines: [
    { speaker: '', text: 'Chains of pale light lower a vast, dreaming shape into the chamber — Thalassyr, cracked with hollow-seams, eyes gone dim.' },
    { speaker: 'Archon Sol', text: 'Stand aside, or stand against a god\'s ruin. Your choice, Warden.' },
  ],
};
D.dlg_sol_liberation = {
  lines: [
    { speaker: 'Archon Sol', text: '...No. NO. This isn\'t— the harvesting was supposed to—' },
    { speaker: '', text: 'Thalassyr\'s cracks flood gold, not gray — Resonance, not harvest, mending what Sol tried to break.' },
    { speaker: 'Archon Sol', text: '...I was so certain. How were you certain of something gentler?' },
    {
      speaker: 'Archon Sol',
      text: '{player}. I concede the field. Not, perhaps, the argument. Do better than I did.',
      choices: [
        { text: 'Reach out — there may still be good in him.', flag: 'sol_epilogue_kind' },
        { text: 'Say nothing. Let his own words sit with him.', flag: 'sol_epilogue_silent' },
      ],
    },
  ],
};
D.dlg_sol_postgame = one('Archon Sol', 'It\'s done, then. I still don\'t know if you\'re right. But the light in this room says you might be.');
// Colored by the epilogue choice in dlg_sol_liberation (flags sol_epilogue_kind / _silent).
D.dlg_sol_epilogue = one('Archon Sol', 'The Order disperses without me to hold it together. Good. Perhaps it should have, long ago.');
D.dlg_sol_epilogue_silent = one('Archon Sol', '...No words, then. Maybe that\'s the honest answer. I\'ll sit with the silence a while.');

D.dlg_credits = many('', [
  'The shardlight remembers every bond, gentle or fierce, brief or lifelong.',
  'Vael dims less, some nights, because a Warden and their Kindred chose each other.',
  'This has been LUMENFALL.',
  'Thank you for walking the Duskmere Reach, {player}.',
  'The Firstborn stir. There is more of Vael left to find.',
]);

// ============================================================================ Postgame legends
D.dlg_aurios_encounter = many('', [
  'Starfall Glade holds its breath. Something vast and patient steps from between two glow-trees, hooves that never quite touch the ground.',
]);
D.dlg_nyxmara_encounter = many('', [
  'Night-sky wings unfold from the dark between the trees — vast, calm, and entirely too aware of you.',
]);
D.dlg_thalassyr_return = many('', [
  'The lake\'s stillness breaks. Something ancient surfaces at the old dais, dreaming even now, curious rather than cruel.',
]);

// =============================================================================== First Hollowed
D.dlg_ww_hollowed_reveal = many('', [
  'The clearing opens onto scarred earth — trees stripped gray, grass gone to ash-colored stubble.',
  'Something moves at the tree line: a shape that should shimmer, but only cracks, pale light leaking from its seams like a broken lantern.',
  'This is what the Order calls mercy. This is a Hollowed Kindred.',
]);
D.dlg_shard_theft = {
  lines: [
    { speaker: '', text: 'Brighthollow\'s plaza is too quiet. The shrine stone stands empty, a socket of light gone dark.' },
    { speaker: 'Elder Maren', text: 'They came at dawn, gray robes and no warning. I couldn\'t stop them — I\'m sorry, {player}.' },
    { speaker: 'Elder Maren', text: 'Gloamcavern. That\'s where the trail leads. Go — and be careful.' },
  ],
};

// =================================================================================== Lore shards
D.lore_dm_1 = one('', '"...and the Lumen wept light across the meadow, and where it wept, the grass remembered how to dream." — fragment, author unknown');
D.lore_ww_1 = one('', '"The wood keeps what it\'s given. Some things, it should not have been given." — carved into bark, no signature');
D.lore_gc_1 = one('', '"Underground, even starlight settles like silt. Patience is the only currency down here." — a miner\'s ledger, water-stained');
D.lore_ml_1 = one('', '"The lake does not reflect the sky. It remembers it, which is a different, older thing." — Driftmoor fisher\'s rhyme');
D.lore_sr_1 = one('', '"Storms don\'t chase Wardens. Wardens walk toward what waits for them." — carved into a Skyreach waystone');
D.lore_ruins_1 = one('', 'A carved star, whole and burning, ringed by a hundred smaller lights reaching toward it like open hands.');
D.lore_ruins_2 = one('', 'The star cracks. The smaller lights scatter and fall, and where they land, the stone itself starts to breathe.');
D.lore_ruins_3 = one('', 'A last panel, worn nearly smooth: a shape in the dark, reaching for the falling light — not to save it. To keep it.');
D.lore_hs_1 = one('', '"Cruelty wearing mercy\'s face is still cruelty. It only fools the one wearing it." — scratched beneath a Spire banner, recently');
D.lore_glade_1 = one('', '"Where a Warden\'s bond runs truest, the dark remembers how to be warm again." — carved fresh into a glow-tree, sap still faintly wet with light');

// Stamp `id` onto every entry (some were built by helpers that don't know their own key).
for (const [id, dlg] of Object.entries(D)) dlg.id = id;

export const DIALOGUES = D;
