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
            let edit = this.getTextEdit(document, missingVariable, c);
            await vscode.workspace.applyEdit(edit);
        } catch (e) {
            console.log(e);
        }
    }

    public getTextEdit(document: vscode.TextDocument, missingVariable: string, c: { mod: string, package: string}) {
        let edit: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();

        const firstImportLine = document.getText().split('\n').findIndex(l => l.startsWith('import'));
        edit.insert(document.uri, new vscode.Position(firstImportLine, 0), 'import ' + c.mod + '\n');

        return edit;
    }
}