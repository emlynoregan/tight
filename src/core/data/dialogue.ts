import type { DialogueNode } from "../model/content-types";

function node(
  id: string,
  speaker: string,
  text: string,
  choices: DialogueNode["choices"],
  extras: Partial<Pick<DialogueNode, "entryConditions" | "entryEffects">> = {},
): DialogueNode {
  return { id, speaker, text, choices, ...extras };
}

export const NPC_DIALOGUE_ROOT: Readonly<Record<string, string>> = {
  mara_guide: "dlg_mara_intro",
  torren_miner: "dlg_torren_guardian",
  vesa_mage: "dlg_vesa_gate",
  enid_medium: "dlg_enid_pursuit",
  orik_spacer: "dlg_orik_space",
  nox_broker: "dlg_nox_void",
  aelia_guide: "dlg_aelia_olympus",
  shopkeeper: "dlg_shopkeeper",
};

export const DIALOGUE_NODES: readonly DialogueNode[] = [
  node("dlg_mara_intro", "mara_guide", "The world is thinner than it looks. Walk the first crack and you will see Stone.", [
    { id: "mara_accept", label: "I will look.", effects: [{ type: "setFlag", flag: "met_mara" }, { type: "startQuest", questId: "q_first_crack" }], next: "dlg_mara_wait" },
    { id: "mara_leave", label: "Not now.", effects: [{ type: "end" }] },
  ]),
  node("dlg_mara_wait", "mara_guide", "Find a place where Stone is dominant. Come back when you have stood there.", [
    {
      id: "mara_report",
      label: "I reached Stone.",
      conditions: [{ type: "dimensionDiscovered", dimension: 4 }],
      effects: [{ type: "completeQuest", questId: "q_first_crack" }],
      next: "dlg_mara_done",
    },
    { id: "mara_wait_leave", label: "I will keep walking.", effects: [{ type: "end" }] },
  ]),
  node("dlg_mara_done", "mara_guide", "Good. The route down is real. Others will ask more of you.", [
    { id: "mara_done_leave", label: "Thank you.", effects: [{ type: "end" }] },
  ]),
  node("dlg_torren_guardian", "torren_miner", "A warden sits on the stair. Kill it and the Stone road opens.", [
    { id: "torren_accept", label: "I will break the warden.", effects: [{ type: "startQuest", questId: "q_stone_warden" }], next: "dlg_torren_wait" },
    { id: "torren_shop", label: "What supplies do you have?", effects: [{ type: "openShop" }] },
    { id: "torren_leave", label: "Later.", effects: [{ type: "end" }] },
  ]),
  node("dlg_torren_wait", "torren_miner", "The warden does not leave. You have to put it down.", [
    {
      id: "torren_done",
      label: "The warden is dead.",
      conditions: [{ type: "questState", questId: "q_stone_warden", state: "complete" }],
      next: "dlg_torren_thanks",
    },
    { id: "torren_shop2", label: "Show me your stock.", effects: [{ type: "openShop" }] },
    { id: "torren_wait_leave", label: "I am still hunting it.", effects: [{ type: "end" }] },
  ]),
  node("dlg_torren_thanks", "torren_miner", "Then the gate should know. Take what you need from my stores.", [
    { id: "torren_shop3", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "torren_thanks_leave", label: "I will go on.", effects: [{ type: "end" }] },
  ]),
  node("dlg_vesa_gate", "vesa_mage", "A door made of spell will open if you learn to ask it.", [
    {
      id: "vesa_learn",
      label: "Teach me.",
      effects: [{ type: "startQuest", questId: "q_arcane_gate" }, { type: "completeQuest", questId: "q_arcane_gate" }],
      next: "dlg_vesa_taught",
    },
    { id: "vesa_shop", label: "Show me your lattice-wares.", effects: [{ type: "openShop" }] },
    { id: "vesa_leave", label: "Another time.", effects: [{ type: "end" }] },
  ]),
  node("dlg_vesa_taught", "vesa_mage", "Arcane Gate is yours. Use it where the world already wants a door.", [
    { id: "vesa_shop2", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "vesa_taught_leave", label: "I understand.", effects: [{ type: "end" }] },
  ]),
  node("dlg_enid_pursuit", "enid_medium", "Spirit roads remember you. Kill the dream-eater if you want the path to stay open, and do not assume you walk alone.", [
    { id: "enid_accept", label: "I will hunt it.", effects: [{ type: "startQuest", questId: "q_spirit_path" }], next: "dlg_enid_wait" },
    { id: "enid_shop", label: "Do you sell wards?", effects: [{ type: "openShop" }] },
    { id: "enid_leave", label: "I should go.", effects: [{ type: "end" }] },
  ]),
  node("dlg_enid_wait", "enid_medium", "When the eater is gone I can show you a step through dream.", [
    {
      id: "enid_done",
      label: "It is gone.",
      conditions: [{ type: "questState", questId: "q_spirit_path", state: "complete" }],
      next: "dlg_enid_thanks",
    },
    { id: "enid_shop2", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "enid_wait_leave", label: "Still hunting.", effects: [{ type: "end" }] },
  ]),
  node("dlg_enid_thanks", "enid_medium", "Dream Step is yours. Pursuit still follows. Be careful on the edge.", [
    { id: "enid_shop3", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "enid_thanks_leave", label: "I will watch my back.", effects: [{ type: "end" }] },
  ]),
  node("dlg_orik_space", "orik_spacer", "Vacuum does not care. Wear a suit, thrust, wrap. The black-orbit thing bars the road.", [
    { id: "orik_accept", label: "I will clear the orbit.", effects: [{ type: "startQuest", questId: "q_star_road" }], next: "dlg_orik_wait" },
    { id: "orik_shop", label: "I need a suit.", effects: [{ type: "openShop" }] },
    { id: "orik_leave", label: "Not yet.", effects: [{ type: "end" }] },
  ]),
  node("dlg_orik_wait", "orik_spacer", "Come back when the black orbit is wreckage.", [
    {
      id: "orik_done",
      label: "The guardian is down.",
      conditions: [{ type: "questState", questId: "q_star_road", state: "complete" }],
      next: "dlg_orik_thanks",
    },
    { id: "orik_shop2", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "orik_wait_leave", label: "Still flying.", effects: [{ type: "end" }] },
  ]),
  node("dlg_orik_thanks", "orik_spacer", "Then Void is next. Do not go bare.", [
    { id: "orik_shop3", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "orik_thanks_leave", label: "Understood.", effects: [{ type: "end" }] },
  ]),
  node("dlg_nox_void", "nox_broker", "The last dark door has a sentinel. Slip if you must. Buy light if you can.", [
    { id: "nox_accept", label: "I will take the sentinel.", effects: [{ type: "startQuest", questId: "q_abyss_gate" }], next: "dlg_nox_wait" },
    { id: "nox_shop", label: "Show me void goods.", effects: [{ type: "openShop" }] },
    { id: "nox_leave", label: "Too dark for now.", effects: [{ type: "end" }] },
  ]),
  node("dlg_nox_wait", "nox_broker", "Void Slip waits on a dead sentinel.", [
    {
      id: "nox_done",
      label: "The sentinel is dead.",
      conditions: [{ type: "questState", questId: "q_abyss_gate", state: "complete" }],
      next: "dlg_nox_thanks",
    },
    { id: "nox_shop2", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "nox_wait_leave", label: "Still descending.", effects: [{ type: "end" }] },
  ]),
  node("dlg_nox_thanks", "nox_broker", "Then Heaven is close. Do not trust the light.", [
    { id: "nox_shop3", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "nox_thanks_leave", label: "I will climb.", effects: [{ type: "end" }] },
  ]),
  node("dlg_aelia_olympus", "aelia_guide", "Olympus is a fight, not a temple. The last thing there will not stay dead unless you finish it.", [
    { id: "aelia_accept", label: "I am going anyway.", effects: [{ type: "startQuest", questId: "q_olympus" }], next: "dlg_aelia_wait" },
    { id: "aelia_shop", label: "Divine stock?", effects: [{ type: "openShop" }] },
    { id: "aelia_leave", label: "I need more time.", effects: [{ type: "end" }] },
  ]),
  node("dlg_aelia_wait", "aelia_guide", "Come back only if the mountain still stands and you do not.", [
    {
      id: "aelia_done",
      label: "The last thing is dead.",
      conditions: [{ type: "questState", questId: "q_olympus", state: "complete" }],
      next: "dlg_aelia_thanks",
    },
    { id: "aelia_shop2", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "aelia_wait_leave", label: "I am still climbing.", effects: [{ type: "end" }] },
  ]),
  node("dlg_aelia_thanks", "aelia_guide", "Then the work is done. Walk where you like.", [
    { id: "aelia_thanks_leave", label: "I will.", effects: [{ type: "end" }] },
  ]),
  node("dlg_shopkeeper", "shopkeeper", "Coin spends. Limited stock does not come back.", [
    { id: "shop_open", label: "Browse stock.", effects: [{ type: "openShop" }] },
    { id: "shop_leave", label: "Not today.", effects: [{ type: "end" }] },
  ]),
];
