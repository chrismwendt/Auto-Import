import { PathHelper } from './helpers/path-helper';
import * as vscode from 'vscode';

import { ImportDb, ImportObject } from './import-db';
import * as request from 'request-promise-native';
import * as cheerio from 'cheerio';
import * as LRU from 'lru-cache';

export interface Context {
    document: vscode.TextDocument;
    range: vscode.Range;
    context: vscode.CodeActionContext;
    token: vscode.CancellationToken;
    missingVariable?: string
}

const askHoogle = variable => {
    return request({
        url: `https://hoogle.haskell.org/?hoogle=${variable}&scope=set%3Astackage&mode=json`,
        json: true
    });
};

const withCache = (cache, f) => a => {
    if (cache.has(a)) {
        return cache.get(a);
    } else {
        const b = f(a);
        cache.set(a, b);
        return b;
    }
}

const cache = LRU({
    // 1 MB
    max: 1000 * 1000,
    length: r => JSON.stringify(r).length
});

export class ImportAction {
    private askHoogleCached = withCache(cache, askHoogle);

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range,
        context: vscode.CodeActionContext, token: vscode.CancellationToken): Promise<vscode.Command[]> {

        let actionContext = this.createContext(document, range, context, token);

        if (this.canHandleAction(actionContext)) {
            return this.actionHandler(actionContext);
        }
    }

    private canHandleAction(context: Context): boolean {
        let diagnostic: vscode.Diagnostic = context.context.diagnostics[0];

        if (!diagnostic) {
            return false;
        }

        if (diagnostic.message.includes('not in scope')) {
            const match = /not in scope:\s*(([^()\s]+)|\(([^\s]*)\))/.exec(diagnostic.message);
            context.missingVariable = match[2] || match[3];
            return true;
        }

        return false;
    }

    private async actionHandler(context: Context): Promise<vscode.Command[]> {
        try {
            const resp = await this.askHoogleCached(context.missingVariable);
            if (resp.length === 0) {
                console.log("No Hoogle results for", context.missingVariable);
            }
            const candidates = resp
                .filter(i => i.module.name)
                .filter(i => cheerio.load(i.item, { xml: {} })('span 0').text() === context.missingVariable)
                .map(i => ({ mod: i.module.name, package: i.package.name }));
            let handlers = candidates.map(c => ({
                title: `Import ${c.package}:${c.mod}`,
                command: 'extension.fixImport',
                arguments: [context.document, context.range, context.context, context.token, context.missingVariable, c]
            }));

            return handlers;
        } catch (e) {
            console.log(e);
        }
    }

    private createContext(document: vscode.TextDocument, range: vscode.Range,
        context: vscode.CodeActionContext, token: vscode.CancellationToken): Context {
        return {
            document, range, context, token
        }
    }
}