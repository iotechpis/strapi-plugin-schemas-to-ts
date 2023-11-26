import { pascalCase } from 'pascal-case';
import path from 'path';
import { InterfaceBuilderResult } from '../../models/interfaceBuilderResult';
import { PluginConfig } from '../../models/pluginConfig';
import defaultSchemaInfo, { SchemaInfo } from '../../models/schemaInfo';
import { SchemaSource } from '../../models/schemaSource';
import { pluginName } from '../../register';
import { CommonHelpers } from '../commonHelpers';
import { FileHelpers } from '../fileHelpers';

export abstract class InterfaceBuilder {
    constructor(
        private commonHelpers: CommonHelpers,
        private config: PluginConfig,
    ) {}

    public convertSchemaToInterfaces(schema: SchemaInfo, schemas: SchemaInfo[]) {
        this.convertToInterface(schema, schemas);

        schema.enums = [...new Set(schema.enums)];
    }

    public async buildInterfacesFileContent(schemas: SchemaInfo[]) {
        let interfacesFileContent = ``;

        for (let schema of schemas) {
            if (schema.enums?.length > 0) {
                interfacesFileContent += schema.enums.join('\n');
                interfacesFileContent += '\n\n';
            }
        }

        for (let schema of schemas) {
            let interfacesText = schema.interfaceAsText;
            interfacesText += `\n${schema.plainInterfaceAsText}`;
            interfacesText = interfacesText.replace('\n\n', '\n');
            interfacesFileContent += interfacesText;
        }

        let interfaceContentTypes = `export interface ContentTypes {\n`;
        for (let schema of schemas) {
            interfaceContentTypes += `  ${schema.pascalName}: ${schema.pascalName};\n`;
        }

        // add user, media and media format
        interfaceContentTypes += `  Media: Media;\n`;
        interfaceContentTypes += `  MediaFormat: MediaFormat;\n`;

        interfaceContentTypes += `};\n`;

        interfacesFileContent += interfaceContentTypes;

        interfacesFileContent += `export type ContentType<T extends keyof ContentTypes> = ContentTypes[T];\n`;

        interfacesFileContent += `
        export interface APIResponseMany<T extends keyof ContentTypes> {
            data: ContentType<T>[];
            meta: {
                pagination: {
                    page: number;
                    pageSize: number;
                    pageCount: number;
                    total: number;
                };
            };
        }
        `;

        interfacesFileContent += `
        export interface APIResponseSingle<T extends keyof ContentTypes> {
            data: ContentType<T>;
        }
        `;

        interfacesFileContent +=
            `
        export interface APIRequestParams<T extends keyof ContentTypes> {
            populate?: any;
            fields?: (keyof ContentType<T>)[];
            locale?: string | string[];
            filters?: any;` +
            'sort?: `${keyof ContentType<T>}:asc` | `${keyof ContentType<T>}:desc` | (`${keyof ContentType<T>}:asc` | `${keyof ContentType<T>}:desc`)[];' +
            `pagination?: {
                page?: number;
                pageSize?: number;
            };
        }
        `;

        return interfacesFileContent;
    }

    public generateCommonSchemas(commonFolderModelsPath: string): SchemaInfo[] {
        const commonSchemas: SchemaInfo[] = [];

        this.addCommonSchema(
            commonSchemas,
            commonFolderModelsPath,
            'MediaFormat',
            `export interface MediaFormat {
                name: string;
                hash: string;
                ext: string;
                mime: string;
                width: number;
                height: number;
                size: number;
                path: string;
                url: string;
            }`,
        );

        this.addCommonSchema(
            commonSchemas,
            commonFolderModelsPath,
            'Media',
            `
    export interface Media {
      id: number;
        name: string;
        alternativeText: string;
        caption: string;
        width: number;
        height: number;
        formats: { thumbnail: MediaFormat; small: MediaFormat; medium: MediaFormat; large: MediaFormat; };
        hash: string;
        ext: string;
        mime: string;
        size: number;
        url: string;
        previewUrl: string;
        provider: string;
        createdAt: Date;
        updatedAt: Date;
    }
    `,
        );

        return commonSchemas;
    }

    public abstract addVersionSpecificCommonSchemas(commonSchemas: SchemaInfo[], commonFolderModelsPath: string): SchemaInfo[];

    protected addCommonSchema(schemas: SchemaInfo[], commonFolderModelsPath: string, pascalName: string, interfaceAsText: string, plainInterfaceAsText?: string): void {
        const schemaInfo: SchemaInfo = Object.assign({}, defaultSchemaInfo);
        schemaInfo.destinationFolder = commonFolderModelsPath;
        schemaInfo.pascalName = pascalName;
        schemaInfo.interfaceAsText = interfaceAsText;
        if (plainInterfaceAsText) {
            schemaInfo.plainInterfaceAsText = plainInterfaceAsText;
        }
        schemas.push(schemaInfo);
    }

    private convertToInterface(schemaInfo: SchemaInfo, allSchemas: SchemaInfo[]) {
        if (!schemaInfo.schema) {
            console.log(`Skipping ${schemaInfo.schemaPath}: schema is empty.`);
            return null;
        }

        const builtInterface: InterfaceBuilderResult = this.buildInterfaceText(schemaInfo, allSchemas);

        schemaInfo.enums.push(...builtInterface.interfaceEnums);

        schemaInfo.plainInterfaceAsText = builtInterface.interfaceText;
    }

    private isOptional(attributeValue): boolean {
        // arrays are never null
        if (attributeValue.relation === 'oneToMany' || attributeValue.repeatable) {
            return false;
        }
        return attributeValue.required !== true;
    }

    private hasDefaultValue(attributeValue): boolean {
        return attributeValue.default !== undefined;
    }

    private buildInterfaceText(schemaInfo: SchemaInfo, allSchemas: SchemaInfo[]): InterfaceBuilderResult {
        const interfaceName: string = this.getInterfaceName(schemaInfo);

        const interfaceEnums: string[] = [];
        const interfaceDependencies: string[] = [];

        let interfaceText = `export interface ${interfaceName} {\n`;
        if (schemaInfo.source === SchemaSource.Api) {
            interfaceText += `  id?: number;\n`;
        }

        let indentation = '  ';

        if (schemaInfo.source !== SchemaSource.Component) {
            interfaceText += `${indentation}createdAt?: Date;`;
            interfaceText += `${indentation}updatedAt?: Date;`;
            interfaceText += `${indentation}publishedAt?: Date;`;
        }

        const attributes = Object.entries(schemaInfo.schema.attributes);
        for (const attribute of attributes) {
            const originalPropertyName: string = attribute[0];
            let propertyName: string = originalPropertyName;
            const attributeValue: any = attribute[1];
            if (this.isOptional(attributeValue)) {
                propertyName += '?';
            }

            let propertyType: string;
            let propertyDefinition: string;
            // -------------------------------------------------
            // Relation
            // -------------------------------------------------
            if (attributeValue.type === 'relation') {
                propertyType = `${pascalCase(attributeValue.target.split('.')[1])}`;

                interfaceDependencies.push(propertyType);
                const isArray = attributeValue.relation.endsWith('ToMany');
                const bracketsIfArray = isArray ? '[] | number[]' : ' | number | null';

                propertyDefinition = `${indentation}${propertyName}${this.isOptional(attributeValue) ? '' : '?'}: ${propertyType}${bracketsIfArray};\n`;
            }

            // -------------------------------------------------
            // Component
            // -------------------------------------------------
            else if (attributeValue.type === 'component') {
                propertyType = attributeValue.target === 'plugin::users-permissions.user' ? 'User' : pascalCase(attributeValue.component.split('.')[1]);

                const componentInfo: SchemaInfo = this.getAttributeComponentInfo(propertyType, allSchemas);
                if (componentInfo.needsComponentSuffix) {
                    propertyType += 'Component';
                }

                interfaceDependencies.push(propertyType);
                const isArray = attributeValue.repeatable;
                const bracketsIfArray = isArray ? '[]' : '';
                propertyDefinition = `${indentation}${propertyName}: ${propertyType}${bracketsIfArray};\n`;
            }

            // -------------------------------------------------
            // Dynamic zone
            // -------------------------------------------------
            else if (attributeValue.type === 'dynamiczone') {
                // TODO
                propertyType = 'any';
                propertyDefinition = `${indentation}${propertyName}: ${propertyType};\n`;
            }

            // -------------------------------------------------
            // Media
            // -------------------------------------------------
            else if (attributeValue.type === 'media') {
                propertyType = 'Media';
                interfaceDependencies.push(propertyType);

                const bracketsIfArray = attributeValue.multiple ? '[] | number[]' : ' | number | null';
                propertyDefinition = `${indentation}${propertyName}${this.isOptional(attributeValue) ? '' : '?'}: ${propertyType}${bracketsIfArray};\n`;
            }

            // -------------------------------------------------
            // Enumeration
            // -------------------------------------------------
            else if (attributeValue.type === 'enumeration') {
                let enumName: string = CommonHelpers.capitalizeFirstLetter(pascalCase(originalPropertyName));
                if (this.config.alwaysAddEnumSuffix || originalPropertyName.toLowerCase() === schemaInfo.pascalName.toLowerCase()) {
                    enumName += 'Enum';
                }
                const enumOptions: string = attributeValue.enum
                    .map((value: string) => {
                        let key: string = value;
                        // The normalize('NFD') method will decompose the accented characters into their basic letters and combining diacritical marks.
                        key = key.normalize('NFD');

                        // Following Typescript documentation, enum keys are Pascal Case.: https://www.typescriptlang.org/docs/handbook/enums.html
                        key = pascalCase(key);

                        /*
          The /[^a-z0-9]/gi is a regular expression that matches any character that is not a letter (a-z, case insensitive due to i) or a digit (0-9).
          The g means it's a global search, so it will replace all instances, not just the first one.
          The replace method then replaces all those matched characters with nothing (''), effectively removing them from the string.
          This even trims the value.
          */
                        key = key.replace(/[^a-z0-9]/gi, '');

                        if (!isNaN(parseFloat(key))) {
                            key = '_' + key;
                        }
                        return `  ${key} = '${value}',`;
                    })
                    .join('\n');
                const enumText: string = `export enum ${enumName} {\n${enumOptions}}`;
                interfaceEnums.push(enumText);

                propertyDefinition = `${indentation}${propertyName}: ${enumName};\n`;
            }

            // -------------------------------------------------
            // Text, RichText, Email, UID
            // -------------------------------------------------
            else if (
                attributeValue.type === 'string' ||
                attributeValue.type === 'text' ||
                attributeValue.type === 'richtext' ||
                attributeValue.type === 'email' ||
                attributeValue.type === 'password' ||
                attributeValue.type === 'uid'
            ) {
                propertyType = 'string';
                propertyDefinition = `${indentation}${propertyName}: ${propertyType};\n`;
            }

            // -------------------------------------------------
            // Json
            // -------------------------------------------------
            else if (attributeValue.type === 'json') {
                propertyType = 'any';
                propertyDefinition = `${indentation}${propertyName}: ${propertyType};\n`;
            }

            // -------------------------------------------------
            // Password
            // -------------------------------------------------
            else if (attributeValue.type === 'password') {
                propertyDefinition = '';
            }

            // -------------------------------------------------
            // Number
            // -------------------------------------------------
            else if (attributeValue.type === 'integer' || attributeValue.type === 'biginteger' || attributeValue.type === 'decimal' || attributeValue.type === 'float') {
                propertyType = `number${!this.hasDefaultValue(attributeValue) ? ' | null' : ''}`;
                propertyDefinition = `${indentation}${propertyName}: ${propertyType};\n`;
            }

            // -------------------------------------------------
            // Date
            // -------------------------------------------------
            else if (attributeValue.type === 'date' || attributeValue.type === 'datetime' || attributeValue.type === 'time') {
                propertyType = `Date${!this.hasDefaultValue(attributeValue) ? ' | null' : ''}`;
                propertyDefinition = `${indentation}${propertyName}: ${propertyType};\n`;
            }

            // -------------------------------------------------
            // Boolean
            // -------------------------------------------------
            else if (attributeValue.type === 'boolean') {
                propertyType = 'boolean';
                propertyDefinition = `${indentation}${propertyName}: ${propertyType};\n`;
            }

            // -------------------------------------------------
            // Others
            // -------------------------------------------------
            else {
                propertyType = 'any';
                propertyDefinition = `${indentation}${propertyName}: ${propertyType};\n`;
            }
            interfaceText += propertyDefinition;
        }
        // -------------------------------------------------
        // Localization
        // -------------------------------------------------
        if (schemaInfo.schema.pluginOptions?.i18n?.localized) {
            interfaceText += `${indentation}locale: string;\n`;
            interfaceText += `${indentation}localizations?: ${schemaInfo.pascalName}[];\n`;
        }

        interfaceText += '}\n';
        return {
            interfaceText,
            interfaceDependencies,
            interfaceEnums,
        };
    }

    /**
     * When looking for the schema info of the attribute of a component, it is necessary to look for it with
     * the Component suffix and without it.
     * A component name could end with the word 'Component' but not needing the suffix, so in this case the function
     * `isComponentWithoutSuffix` would return true.
     */
    private getAttributeComponentInfo(propertyType: string, allSchemas: SchemaInfo[]): SchemaInfo {
        function isComponentWithoutSuffix(schemaInfo: SchemaInfo): unknown {
            return !schemaInfo.needsComponentSuffix && schemaInfo.pascalName === propertyType;
        }
        function isComponentWithSuffix(schemaInfo: SchemaInfo): unknown {
            return schemaInfo.needsComponentSuffix && schemaInfo.pascalName === `${propertyType}Component`;
        }

        return allSchemas.find((schemaInfo) => schemaInfo.source === SchemaSource.Component && (isComponentWithoutSuffix(schemaInfo) || isComponentWithSuffix(schemaInfo)));
    }

    private getInterfaceName(schemaInfo: SchemaInfo) {
        let interfaceName: string = schemaInfo.pascalName;
        return interfaceName;
    }

    private getImportPath(importPath: string, fileName: string): string {
        let result = '';
        if (importPath === './') {
            result = `./${fileName}`;
        } else {
            result = path.join(importPath, fileName);
        }

        if (CommonHelpers.isWindows()) {
            result = result.replaceAll('\\', '/');
        }

        return result;
    }
}
