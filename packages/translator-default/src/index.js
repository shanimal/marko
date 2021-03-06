import { types as t } from "@marko/babel-types";
import {
  parseExpression,
  resolveTagImport,
  resolveRelativePath,
  importNamed,
  importDefault,
  parseScript,
  isNativeTag,
  isMacroTag,
  isDynamicTag,
  isAttributeTag,
  loadFileForTag,
  findParentTag
} from "@marko/babel-utils";
import { version } from "marko/package.json";
import MarkoDocumentType from "./document-type";
import MarkoDeclaration from "./declaration";
import MarkoCDATA from "./cdata";
import MarkoTag from "./tag";
import MarkoText from "./text";
import MarkoPlaceholder from "./placeholder";
import MarkoComment from "./comment";
import MarkoScriptlet from "./scriptlet";
import MarkoClass from "./class";
import { analyzeStaticVDOM } from "./util/optimize-vdom-create";
import { optimizeHTMLWrites } from "./util/optimize-html-writes";
import getComponentFiles from "./util/get-component-files";

export { default as taglibs } from "./taglib";

export const analyze = {
  Program(program) {
    // Pre populate metadata for component files.
    getComponentFiles(program);
  },
  MarkoTag(tag) {
    // Check if tag uses stateful tag params.
    const meta = tag.hub.file.metadata.marko;

    if (
      meta.hasStatefulTagParams ||
      isNativeTag(tag) ||
      isMacroTag(tag) ||
      !tag.get("body").get("params").length
    ) {
      return;
    }

    if (isDynamicTag(tag)) {
      meta.hasStatefulTagParams = true;
      return;
    }

    let curTag = tag;
    while (isAttributeTag(curTag)) {
      curTag = findParentTag(curTag);
    }

    const tagFile = loadFileForTag(curTag);
    const childMeta = tagFile && tagFile.metadata.marko;
    meta.hasStatefulTagParams =
      childMeta &&
      (childMeta.hasStatefulTagParams ||
        (childMeta.hasComponent && !childMeta.hasComponentBrowser));
  }
};

export const translate = {
  MarkoDocumentType,
  MarkoDeclaration,
  MarkoCDATA,
  MarkoTag,
  MarkoText,
  MarkoPlaceholder,
  MarkoScriptlet,
  MarkoClass,
  MarkoComment,
  Program: {
    enter(path) {
      const {
        hub: { file }
      } = path;

      if (file.metadata.marko.moduleCode) {
        path
          .replaceWith(parseScript(file, file.metadata.marko.moduleCode))[0]
          .skip();
        return;
      }

      file._componentDefIdentifier = path.scope.generateUidIdentifier(
        "component"
      );

      // Pre-Analyze tree
      analyzeStaticVDOM(path);

      // Move non static content into the renderBody.
      const [renderBlock] = path.pushContainer("body", t.blockStatement([]));
      path
        .get("body")
        .filter(isRenderContent)
        .forEach(childPath => {
          renderBlock.pushContainer("body", childPath.node);
          childPath.remove();
        });

      file._renderBlock = renderBlock;
    },
    exit(path) {
      const {
        hub: { file }
      } = path;
      const { markoOpts, _inlineComponentClass } = file;
      const includeMetaInSource = markoOpts.meta !== false;
      const meta = file.metadata.marko;
      const {
        styleFile,
        packageFile,
        componentFile,
        componentBrowserFile
      } = getComponentFiles(path);
      const isHTML = markoOpts.output === "html";

      if (packageFile) {
        meta.deps.unshift(`package: ${packageFile}`);
      }

      if (styleFile) {
        meta.deps.unshift(styleFile);
      }

      if (meta.hasComponentBrowser) {
        meta.component = componentBrowserFile;
      } else if (meta.hasComponent || meta.hasStatefulTagParams) {
        meta.component = file.opts.sourceFileName;
      }

      meta.component =
        meta.component && resolveRelativePath(file, meta.component);
      meta.deps = meta.deps.map(filename =>
        typeof filename === "string"
          ? resolveRelativePath(file, filename)
          : filename
      );

      const renderBlock = file._renderBlock;
      const componentClass =
        (componentFile &&
          importDefault(
            file,
            resolveRelativePath(file, componentFile),
            "marko_component"
          )) ||
        _inlineComponentClass ||
        t.objectExpression([]);

      const componentIdentifier = path.scope.generateUidIdentifier(
        "marko_component"
      );
      const componentTypeIdentifier = path.scope.generateUidIdentifier(
        "marko_componentType"
      );
      const templateIdentifier = path.scope.generateUidIdentifier(
        "marko_template"
      );
      const rendererIdentifier = importDefault(
        file,
        "marko/src/runtime/components/renderer",
        "marko_renderer"
      );
      const templateRendererMember = t.memberExpression(
        templateIdentifier,
        t.identifier("_")
      );
      const templateMetaMember = t.memberExpression(
        templateIdentifier,
        t.identifier("meta")
      );

      if (markoOpts.writeVersionComment) {
        path.addComment(
          "leading",
          ` Compiled using marko@${version} - DO NOT EDIT`,
          true
        );
      }

      path.unshiftContainer(
        "body",
        t.exportDefaultDeclaration(templateIdentifier)
      );
      path.unshiftContainer(
        "body",
        t.variableDeclaration("const", [
          t.variableDeclarator(
            templateIdentifier,
            t.callExpression(
              importNamed(
                file,
                `marko/src/runtime/${isHTML ? "html" : "vdom"}`,
                "t"
              ),
              includeMetaInSource ? [t.identifier("__filename")] : []
            )
          )
        ])
      );

      const componentIdString = t.stringLiteral(meta.id);
      path.pushContainer(
        "body",
        t.variableDeclaration("const", [
          t.variableDeclarator(
            componentTypeIdentifier,
            isHTML
              ? componentIdString
              : t.callExpression(
                  importNamed(
                    file,
                    "marko/src/runtime/components/registry-browser",
                    "r",
                    "marko_registerComponent"
                  ),
                  [
                    componentIdString,
                    t.arrowFunctionExpression(
                      [],
                      componentBrowserFile
                        ? importDefault(
                            file,
                            resolveRelativePath(file, componentBrowserFile),
                            "marko_split_component"
                          )
                        : templateIdentifier
                    )
                  ]
                )
          ),
          t.variableDeclarator(componentIdentifier, componentClass)
        ])
      );

      const templateRenderOptionsProps = [
        t.objectProperty(t.identifier("t"), componentTypeIdentifier)
      ];

      if (!meta.component) {
        templateRenderOptionsProps.push(
          t.objectProperty(t.identifier("i"), t.booleanLiteral(true))
        );
      }

      if (componentBrowserFile) {
        templateRenderOptionsProps.push(
          t.objectProperty(t.identifier("s"), t.booleanLiteral(true))
        );
      }

      if (!markoOpts.optimize) {
        templateRenderOptionsProps.push(
          t.objectProperty(t.identifier("d"), t.booleanLiteral(true))
        );
      }

      path.pushContainer(
        "body",
        t.expressionStatement(
          t.assignmentExpression(
            "=",
            templateRendererMember,
            t.callExpression(rendererIdentifier, [
              t.functionExpression(
                null,
                [
                  t.identifier("input"),
                  t.identifier("out"),
                  file._componentDefIdentifier,
                  t.identifier("component"),
                  t.identifier("state")
                ],
                renderBlock.node
              ),
              t.objectExpression(templateRenderOptionsProps),
              componentIdentifier
            ])
          )
        )
      );
      renderBlock.remove();

      if (!isHTML) {
        path.pushContainer(
          "body",
          t.expressionStatement(
            t.assignmentExpression(
              "=",
              t.memberExpression(templateIdentifier, t.identifier("Component")),
              t.callExpression(
                importDefault(
                  file,
                  "marko/src/runtime/components/defineComponent",
                  "marko_defineComponent"
                ),
                [componentIdentifier, templateRendererMember]
              )
            )
          )
        );
      }

      if (includeMetaInSource) {
        const metaObject = t.objectExpression([
          t.objectProperty(t.identifier("id"), componentTypeIdentifier)
        ]);

        if (meta.component) {
          metaObject.properties.push(
            t.objectProperty(
              t.identifier("component"),
              t.stringLiteral(meta.component)
            )
          );
        }

        if (meta.deps.length) {
          metaObject.properties.push(
            t.objectProperty(
              t.identifier("deps"),
              parseExpression(file, JSON.stringify(meta.deps), file.code.length)
            )
          );
        }

        if (meta.tags.length) {
          metaObject.properties.push(
            t.objectProperty(
              t.identifier("tags"),
              t.arrayExpression(meta.tags.map(tag => t.stringLiteral(tag)))
            )
          );
        }

        path.pushContainer(
          "body",
          t.expressionStatement(
            t.assignmentExpression("=", templateMetaMember, metaObject)
          )
        );
      }

      optimizeHTMLWrites(path);
    }
  },
  ImportDeclaration: {
    exit(path) {
      const source = path.get("source");
      const tagEntry = resolveTagImport(source, source.node.value);

      if (tagEntry) {
        const meta = path.hub.file.metadata.marko;
        source.node.value = tagEntry;

        if (!meta.tags.includes(tagEntry)) {
          meta.tags.push(tagEntry);
        }
      }
    }
  }
};

function isRenderContent(path) {
  const { node } = path;
  return t.MARKO_TYPES.includes(node.type) && !node.static;
}
