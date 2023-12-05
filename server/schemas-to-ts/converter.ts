import { Strapi } from '@strapi/strapi';
import fs from 'fs';
import { pascalCase } from 'pascal-case';
import path from 'path';
import prettier from 'prettier';
import { PluginConfig } from '../models/pluginConfig';
import { SchemaInfo } from '../models/schemaInfo';
import { SchemaSource } from '../models/schemaSource';
import { pluginName } from '../register';
import { CommonHelpers } from './commonHelpers';
import { FileHelpers } from './fileHelpers';
import { InterfaceBuilder } from './interface-builders/interfaceBuilder';

export class Converter {
    private readonly commonHelpers: CommonHelpers;
    private readonly interfaceBuilder: InterfaceBuilder;
    private readonly config: PluginConfig;
    private prettierOptions: prettier.Options | undefined;
    private contentTypes: any;

    constructor(strapi: Strapi, config: PluginConfig) {
        this.config = config;
        this.contentTypes = strapi.contentTypes;
        this.commonHelpers = new CommonHelpers(config);
        this.interfaceBuilder = new InterfaceBuilder(config);
        this.commonHelpers.printVerboseLog(`${pluginName} configuration`, this.config);
    }

    public async setPrettierOptions() {
        this.prettierOptions = await this.commonHelpers.getPrettierOptions();
    }

    public SchemasToTs(): void {
        const currentNodeEnv: string = process.env.NODE_ENV ?? '';
        const acceptedNodeEnvs = this.config.acceptedNodeEnvs ?? [];
        if (!acceptedNodeEnvs.includes(currentNodeEnv)) {
            console.log(`${pluginName} plugin's acceptedNodeEnvs property does not include '${currentNodeEnv}' environment. Skipping conversion of schemas to Typescript.`);
            return;
        }

        const schemas: SchemaInfo[] = [];
        for (const uid in this.contentTypes) {
            if (this.interfaceBuilder.shouldSkipSchema(uid)) {
                console.log(`Skipping schema ${uid}`);
                continue;
            }
            if (this.contentTypes[uid].info.singularName == 'file') {
                this.contentTypes[uid].info.singularName = 'media';
            }
            schemas.push(this.parseSchema(this.contentTypes[uid], SchemaSource.Api));
        }
        for (const schema of schemas) {
            this.interfaceBuilder.convertSchemaToInterfaces(schema, schemas);
        }

        this.writeInterfacesFile(schemas);
    }

    private parseSchema(schema: any, schemaSource: SchemaSource): SchemaInfo {
        let schemaName = '';

        switch (schemaSource) {
            case SchemaSource.Api:
                schemaName = schema.info.singularName;
                break;
            case SchemaSource.Common:
                schemaName = schema.info.displayName;
                break;
            case SchemaSource.Component:
                // let fileNameWithoutExtension = path.basename(file, path.extname(file));
                // schemaName = fileNameWithoutExtension;
                // folder = path.join(path.dirname(file), this.componentInterfacesFolderName);
                // if (!FileHelpers.folderExists(folder)) {
                //     fs.mkdirSync(folder);
                // }
                break;
        }

        let pascalName: string = pascalCase(schemaName);
        let needsComponentSuffix: boolean = schemaSource === SchemaSource.Component && this.config.alwaysAddComponentSuffix;
        if (needsComponentSuffix) {
            pascalName += 'Component';
        }

        return {
            schema: schema,
            schemaName: schemaName,
            pascalName: pascalName,
            needsComponentSuffix: needsComponentSuffix,
            source: schemaSource,
            interfaceAsText: '',
            plainInterfaceAsText: '',
            enums: [],
        };
    }

    private async writeInterfacesFile(schemas: SchemaInfo[]) {
        let interfacesFileContent = await this.interfaceBuilder.buildInterfacesFileContent(schemas);

        await this.setPrettierOptions();

        if (this.prettierOptions) {
            const options = this.prettierOptions;
            if (!options.parser) {
                options.parser = 'typescript';
            }
            interfacesFileContent = await prettier.format(interfacesFileContent, options);
        }
        FileHelpers.writeInterfaceFile('', 'contentTypes.d.ts', interfacesFileContent);
    }
}
