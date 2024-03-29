"use strict";

import { I8271, WD1770 } from "./fdc.js";

class Model {
    constructor(name, synonyms, os, nmos, isMaster, swram, fdc, tube, isAtom, useFdc) {
        this.name = name;
        this.synonyms = synonyms;
        this.os = os;
        this.nmos = nmos;
        this.isMaster = isMaster;
        this.isAtom = isAtom;
        this.Fdc = fdc;
        this.swram = swram;
        this.isTest = false;
        this.tube = tube;
        this.useFdc = useFdc;
    }
}

// TODO: semi-bplus-style to get swram for exile hardcoded here
const beebSwram = [
    true,
    true,
    true,
    true, // Dunjunz variants. Exile (not picky).
    true,
    true,
    true,
    true, // Crazee Rider.
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
];
const masterSwram = [
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
];
export const allModels = [
    new Model(
        "BBC B with DFS 1.2",
        ["B-DFS1.2"],
        ["os.rom", "BASIC.ROM", "b/DFS-1.2.rom"],
        true,
        false,
        beebSwram,
        I8271
    ),
    new Model(
        "BBC B with DFS 0.9",
        ["B-DFS0.9", "B"],
        ["os.rom", "BASIC.ROM", "b/DFS-0.9.rom"],
        true,
        false,
        beebSwram,
        I8271
    ),
    new Model(
        "BBC B with ADFS",
        ["B1770"],
        ["os.rom", "BASIC.ROM", "b1770/dfs1770.rom", "b1770/zADFS.ROM"],
        true,
        false,
        beebSwram,
        WD1770
    ),
    new Model("BBC Master 128", ["Master"], ["master/mos3.20"], false, true, masterSwram, WD1770),
    new Model("Tube65C02", [], ["tube/6502Tube.rom"], false, false), // Although this can not be explicitly selected as a model, it is required by the configuration builder later

    new Model(
        "Acorn Atom (MMC)",
        ["Atom"],
        ["atom/Atom_Kernel_E.rom", "atom/ATMMC3E.rom", "atom/Atom_FloatingPoint.rom", "atom/Atom_Basic.rom"],
        true,
        false,
        beebSwram,
        I8271,
        null,
        true
    ),
    new Model(
        "Acorn Atom (Tape)",
        ["Atom-Tape"],
        ["atom/Atom_Kernel.rom", "", "", "atom/Atom_Basic.rom"],
        true,
        false,
        beebSwram,
        I8271,
        null,
        true
    ),
    new Model(
        "Acorn Atom (Tape with FP)",
        ["Atom-Tape-FP"],
        ["atom/Atom_Kernel.rom", "", "atom/Atom_FloatingPoint.rom", "atom/Atom_Basic.rom"],
        true,
        false,
        beebSwram,
        I8271,
        null,
        true
    ),
    new Model(
        "Acorn Atom (DOS)",
        ["Atom-DOS"],
        ["atom/Atom_Kernel.rom", "atom/Atom_DOS.rom", "atom/Atom_FloatingPoint.rom", "atom/Atom_Basic.rom"],
        true,
        false,
        beebSwram,
        I8271,
        null,
        true,
        true
    ),
];

export function findModel(name) {
    name = name.toLowerCase();
    for (let i = 0; i < allModels.length; ++i) {
        const model = allModels[i];
        if (model.name.toLowerCase() === name) return model;
        for (let j = 0; j < model.synonyms.length; ++j) {
            if (model.synonyms[j].toLowerCase() === name) return model;
        }
    }
    return null;
}

export const TEST_6502 = new Model("TEST", ["TEST"], [], true, false, beebSwram, I8271);
TEST_6502.isTest = true;
export const TEST_65C12 = new Model("TEST", ["TEST"], [], false, false, masterSwram, I8271);
TEST_65C12.isTest = true;

export const basicOnly = new Model("Basic only", ["Basic only"], ["master/mos3.20"], false, true, masterSwram, WD1770);
