import * as vscode from 'vscode'
import * as path from 'path';

import { ImportObject } from './import-db';

export class ImportFixer {

    private spacesBetweenBraces;
    private doubleQuotes;
    private useSemiColon;

    constructor() {
        let config = vscode.workspace.getConfiguration('autoimport');

        this.useSemiColon = config.get<boolean>('useSemiColon');
        this.spacesBetweenBraces = config.get<boolean>('spaceBetweenBraces');
        this.doubleQuotes = config.get<boolean>('doubleQuotes');
    }

    public async fix(document: vscode.TextDocument, range: vscode.Range,
        context: vscode.CodeActionContext, token: vscode.CancellationToken, missingVariable: string, c: { mod: string, package: string }): Promise<void> {
        try {
            let edit = await this.getTextEdit(document, missingVariable, c);
            await vscode.workspace.applyEdit(edit);
            await Promise.all(
                edit.entries().map(async ([uri, _edit]) =>
                    // Saving here retriggers type checking (at least for the Haskell Language Server extension)
                    await (await vscode.workspace.openTextDocument(uri)).save()
                )
            );
        } catch (e) {
            console.log(e);
        }
    }

    public async getTextEdit(document: vscode.TextDocument, missingVariable: string, c: { mod: string, package: string}) {
        let edit: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();

        const firstImportLine = document.getText().split('\n').findIndex(l => l.startsWith('import'));
        edit.insert(document.uri, new vscode.Position(firstImportLine, 0), 'import ' + c.mod + '\n');

        const cabals = await vscode.workspace.findFiles('*.cabal');
        let cabal;
        if (cabals.length > 1) {
            console.log("Multiple cabal files found (" + cabals + ". Choosing arbitrarily.");
        }
        cabal = await vscode.workspace.openTextDocument(cabals[0]);

        const findIndexes = (array, predicate) => {
            let indexes = [];
            let start = 0;
            while (true) {
                const i = array.slice(start, array.length).findIndex(predicate);
                if (i === -1) {
                    return indexes;
                }
                indexes.push(start + i);
                start += i + 1;
            }
        };

        if (!cabal.getText().split('\n').some(line => line.includes(c.package))) {
            const lines = cabal.getText().split('\n');
            const buildDependsIndexes = findIndexes(lines, line => /^\s*build-depends\s*:/i.test(line));
            if (buildDependsIndexes.length > 0) {
                const bdLine = buildDependsIndexes[buildDependsIndexes.length - 1];
                const nextLine = bdLine + 1 < lines.length ? lines[bdLine + 1] : '';
                if (/^\s+,/.test(nextLine)) {
                    // Multi-line leading-comma format:
                    //   Build-depends:       base >= 4.12
                    //                      , resourcet >= 1.2
                    // Match indentation of existing continuation lines.
                    const prefix = nextLine.match(/^(\s+,\s*)/)[1];
                    let insertionLine = bdLine + 1;
                    while (insertionLine < lines.length && /^\s+,/.test(lines[insertionLine])) {
                        insertionLine++;
                    }
                    edit.insert(cabal.uri, new vscode.Position(insertionLine, 0), prefix + c.package + '\n');
                } else {
                    // Inline format: build-depends: a, b, c
                    const lineLen = lines[bdLine].length;
                    edit.insert(cabal.uri, new vscode.Position(bdLine, lineLen), ', ' + c.package);
                }
            }
        }

        return edit;
    }
}