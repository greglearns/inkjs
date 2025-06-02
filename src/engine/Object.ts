import { Path } from "./Path";
import { Debug } from "./Debug";
import { asOrNull, asINamedContentOrNull } from "./TypeAssertion";
import { throwNullException } from "./NullException";
import { DebugMetadata } from "./DebugMetadata";

export class InkObject {
  public parent: InkObject | null = null;

  get debugMetadata(): DebugMetadata | null {
    if (this._debugMetadata === null) {
      if (this.parent) {
        return this.parent.debugMetadata;
      }
    }

    return this._debugMetadata;
  }

  set debugMetadata(value) {
    this._debugMetadata = value;
  }

  get ownDebugMetadata() {
    return this._debugMetadata;
  }

  private _debugMetadata: DebugMetadata | null = null;

  public DebugLineNumberOfPath(path: Path) {
    if (path === null) return null;

    // Try to get a line number from debug metadata
    let root = this.rootContentContainer;
    if (root) {
      let targetContent = root.ContentAtPath(path).obj;
      if (targetContent) {
        let dm = targetContent.debugMetadata;
        if (dm !== null) {
          return dm.startLineNumber;
        }
      }
    }

    return null;
  }

  get path() {
    if (this._path == null) {
      if (this.parent == null) {
        this._path = new Path();
      } else {
        let comps: Path.Component[] = [];

        let child: InkObject = this;
        let container = asOrNull(child.parent, Container);

        while (container !== null) {
          let namedChild = asINamedContentOrNull(child);
          if (namedChild != null && namedChild.hasValidName) {
            if (namedChild.name === null)
              return throwNullException("namedChild.name");
            comps.unshift(new Path.Component(namedChild.name!));
          } else {
            comps.unshift(new Path.Component(container.content.indexOf(child)));
          }

          child = container;
          container = asOrNull(container.parent, Container);
        }

        this._path = new Path(comps);
      }
    }

    return this._path;
  }
  private _path: Path | null = null;

  public ResolvePath(path: Path | null): SearchResult {
    if (path === null) return throwNullException("path");
    if (path.isRelative) {
      let nearestContainer = asOrNull(this, Container);

      if (nearestContainer === null) {
        Debug.Assert(
          this.parent !== null,
          "Can't resolve relative path because we don't have a parent"
        );
        nearestContainer = asOrNull(this.parent, Container);
        Debug.Assert(
          nearestContainer !== null,
          "Expected parent to be a container"
        );
        Debug.Assert(path.GetComponent(0).isParent);
        path = path.tail;
      }

      if (nearestContainer === null) {
        return throwNullException("nearestContainer");
      }
      return nearestContainer.ContentAtPath(path);
    } else {
      let contentContainer = this.rootContentContainer;
      if (contentContainer === null) {
        return throwNullException("contentContainer");
      }
      return contentContainer.ContentAtPath(path);
    }
  }

  public ConvertPathToRelative(globalPath: Path) {
    let ownPath = this.path;

    let minPathLength = Math.min(globalPath.length, ownPath.length);
    let lastSharedPathCompIndex = -1;

    for (let i = 0; i < minPathLength; ++i) {
      let ownComp = ownPath.GetComponent(i);
      let otherComp = globalPath.GetComponent(i);

      if (ownComp.Equals(otherComp)) {
        lastSharedPathCompIndex = i;
      } else {
        break;
      }
    }

    // No shared path components, so just use global path
    if (lastSharedPathCompIndex == -1) return globalPath;

    let numUpwardsMoves = ownPath.componentCount - 1 - lastSharedPathCompIndex;

    let newPathComps: Path.Component[] = [];

    for (let up = 0; up < numUpwardsMoves; ++up)
      newPathComps.push(Path.Component.ToParent());

    for (
      let down = lastSharedPathCompIndex + 1;
      down < globalPath.componentCount;
      ++down
    )
      newPathComps.push(globalPath.GetComponent(down));

    let relativePath = new Path(newPathComps, true);
    return relativePath;
  }

  public CompactPathString(otherPath: Path) {
    let globalPathStr = null;
    let relativePathStr = null;

    if (otherPath.isRelative) {
      relativePathStr = otherPath.componentsString;
      globalPathStr = this.path.PathByAppendingPath(otherPath).componentsString;
    } else {
      let relativePath = this.ConvertPathToRelative(otherPath);
      relativePathStr = relativePath.componentsString;
      globalPathStr = otherPath.componentsString;
    }

    if (relativePathStr.length < globalPathStr.length) return relativePathStr;
    else return globalPathStr;
  }

  get rootContentContainer() {
    let ancestor: InkObject = this;
    while (ancestor.parent) {
      ancestor = ancestor.parent;
    }
    return asOrNull(ancestor, Container);
  }

  public Copy(): InkObject {
    throw Error("Not Implemented: Doesn't support copying");
  }
  // SetChild works slightly diferently in the js implementation.
  // Since we can't pass an objets property by reference, we instead pass
  // the object and the property string.
  // TODO: This method can probably be rewritten with type-safety in mind.
  public SetChild(obj: any, prop: any, value: any) {
    if (obj[prop]) obj[prop] = null;

    obj[prop] = value;

    if (obj[prop]) obj[prop].parent = this;
  }

  public Equals(obj: any) {
    return obj === this;
  }
}

import { StringBuilder } from "./StringBuilder";
import { INamedContent } from "./INamedContent";
import { tryGetValueFromMap } from "./TryGetResult";
import { asOrThrows } from "./TypeAssertion";

export class Container extends InkObject implements INamedContent {
  public name: string | null = null;

  public _content: InkObject[] = [];
  public namedContent: Map<string, INamedContent> = new Map();

  public visitsShouldBeCounted: boolean = false;
  public turnIndexShouldBeCounted: boolean = false;
  public countingAtStartOnly: boolean = false;

  public _pathToFirstLeafContent: Path | null = null;

  get hasValidName() {
    return this.name != null && this.name.length > 0;
  }
  get content() {
    return this._content;
  }
  set content(value: InkObject[]) {
    this.AddContent(value);
  }
  get namedOnlyContent() {
    let namedOnlyContentDict: Map<string, InkObject> | null = new Map();

    for (let [key, value] of this.namedContent) {
      let inkObject = asOrThrows(value, InkObject);
      namedOnlyContentDict.set(key, inkObject);
    }

    for (let c of this.content) {
      let named = asINamedContentOrNull(c);
      if (named != null && named.hasValidName) {
        namedOnlyContentDict.delete(named.name!);
      }
    }

    if (namedOnlyContentDict.size == 0) namedOnlyContentDict = null;

    return namedOnlyContentDict;
  }
  set namedOnlyContent(value: Map<string, InkObject> | null) {
    let existingNamedOnly = this.namedOnlyContent;
    if (existingNamedOnly != null) {
      for (let [key] of existingNamedOnly) {
        this.namedContent.delete(key);
      }
    }

    if (value == null) return;

    for (let [, val] of value) {
      let named = asINamedContentOrNull(val);
      if (named != null) this.AddToNamedContentOnly(named);
    }
  }
  get countFlags(): number {
    let flags: Container.CountFlags = 0;
    if (this.visitsShouldBeCounted) flags |= Container.CountFlags.Visits;
    if (this.turnIndexShouldBeCounted) flags |= Container.CountFlags.Turns;
    if (this.countingAtStartOnly) flags |= Container.CountFlags.CountStartOnly;

    if (flags == Container.CountFlags.CountStartOnly) {
      flags = 0;
    }

    return flags;
  }
  set countFlags(value: number) {
    let flag: Container.CountFlags = value;
    if ((flag & Container.CountFlags.Visits) > 0)
      this.visitsShouldBeCounted = true;
    if ((flag & Container.CountFlags.Turns) > 0)
      this.turnIndexShouldBeCounted = true;
    if ((flag & Container.CountFlags.CountStartOnly) > 0)
      this.countingAtStartOnly = true;
  }
  get pathToFirstLeafContent() {
    if (this._pathToFirstLeafContent == null)
      this._pathToFirstLeafContent = this.path.PathByAppendingPath(
        this.internalPathToFirstLeafContent
      );

    return this._pathToFirstLeafContent;
  }
  get internalPathToFirstLeafContent() {
    let components: Path.Component[] = [];
    let container: Container = this;
    while (container instanceof Container) {
      if (container.content.length > 0) {
        components.push(new Path.Component(0));
        container = container.content[0] as Container;
      }
    }
    return new Path(components);
  }

  public AddContent(contentObjOrList: InkObject | InkObject[]) {
    if (contentObjOrList instanceof Array) {
      let contentList = contentObjOrList as InkObject[];

      for (let c of contentList) {
        this.AddContent(c);
      }
    } else {
      let contentObj = contentObjOrList as InkObject;

      this._content.push(contentObj);

      if (contentObj.parent) {
        throw new Error("content is already in " + contentObj.parent);
      }

      contentObj.parent = this;

      this.TryAddNamedContent(contentObj);
    }
  }
  public TryAddNamedContent(contentObj: InkObject) {
    let namedContentObj = asINamedContentOrNull(contentObj);
    if (namedContentObj != null && namedContentObj.hasValidName) {
      this.AddToNamedContentOnly(namedContentObj);
    }
  }
  public AddToNamedContentOnly(namedContentObj: INamedContent) {
    Debug.AssertType(
      namedContentObj,
      InkObject,
      "Can only add Runtime.Objects to a Runtime.Container"
    );
    let runtimeObj = asOrThrows(namedContentObj, InkObject);
    runtimeObj.parent = this;

    if (namedContentObj.name === null)
      return throwNullException("namedContentObj.name");
    this.namedContent.set(namedContentObj.name!, namedContentObj);
  }
  public ContentAtPath(
    path: Path,
    partialPathStart: number = 0,
    partialPathLength: number = -1
  ) {
    if (partialPathLength == -1) partialPathLength = path.length;

    let result = new SearchResult();
    result.approximate = false;

    let currentContainer: Container | null = this;
    let currentObj: InkObject = this;

    for (let i = partialPathStart; i < partialPathLength; ++i) {
      let comp = path.GetComponent(i);
      if (currentContainer == null) {
        result.approximate = true;
        break;
      }

      let foundObj: InkObject | null =
        currentContainer.ContentWithPathComponent(comp);

      // Couldn't resolve entire path?
      if (foundObj == null) {
        result.approximate = true;
        break;
      }

      // Are we about to loop into another container?
      // Is the object a container as expected? It might
      // no longer be if the content has shuffled around, so what
      // was originally a container no longer is.
      const nextContainer: Container | null = asOrNull(foundObj, Container);
      if (i < partialPathLength - 1 && nextContainer == null) {
        result.approximate = true;
        break;
      }

      currentObj = foundObj;
      currentContainer = nextContainer;
    }

    result.obj = currentObj;

    return result;
  }
  public InsertContent(contentObj: InkObject, index: number) {
    this.content.splice(index, 0, contentObj);

    if (contentObj.parent) {
      throw new Error("content is already in " + contentObj.parent);
    }

    contentObj.parent = this;

    this.TryAddNamedContent(contentObj);
  }
  public AddContentsOfContainer(otherContainer: Container) {
    this.content.push(...otherContainer.content);

    for (let obj of otherContainer.content) {
      obj.parent = this;
      this.TryAddNamedContent(obj);
    }
  }
  public ContentWithPathComponent(component: Path.Component): InkObject | null {
    if (component.isIndex) {
      if (component.index >= 0 && component.index < this.content.length) {
        return this.content[component.index];
      } else {
        return null;
      }
    } else if (component.isParent) {
      return this.parent;
    } else {
      if (component.name === null) {
        return throwNullException("component.name");
      }
      let foundContent = tryGetValueFromMap(
        this.namedContent,
        component.name,
        null
      );
      if (foundContent.exists) {
        return asOrThrows(foundContent.result, InkObject);
      } else {
        return null;
      }
    }
  }
  public BuildStringOfHierarchy(): string;
  public BuildStringOfHierarchy(
    sb: StringBuilder,
    indentation: number,
    pointedObj: InkObject | null
  ): string;
  public BuildStringOfHierarchy() {
    let sb: StringBuilder;
    if (arguments.length == 0) {
      sb = new StringBuilder();
      this.BuildStringOfHierarchy(sb, 0, null);
      return sb.toString();
    }

    sb = arguments[0] as StringBuilder;
    let indentation = arguments[1] as number;
    let pointedObj = arguments[2] as InkObject | null;

    function appendIndentation() {
      const spacesPerIndent = 4; // Truly const in the original code
      for (let i = 0; i < spacesPerIndent * indentation; ++i) {
        sb.Append(" ");
      }
    }

    appendIndentation();
    sb.Append("[");

    if (this.hasValidName) {
      sb.AppendFormat(" ({0})", this.name);
    }

    if (this == pointedObj) {
      sb.Append("  <---");
    }

    sb.AppendLine();

    indentation++;

    for (let i = 0; i < this.content.length; ++i) {
      let obj = this.content[i];

      if (obj instanceof Container) {
        let container = obj as Container;

        container.BuildStringOfHierarchy(sb, indentation, pointedObj);
      } else {
        appendIndentation();
        if (obj instanceof StringValue) {
          sb.Append('"');
          sb.Append(obj.toString().replace("\n", "\\n"));
          sb.Append('"');
        } else {
          sb.Append(obj.toString());
        }
      }

      if (i != this.content.length - 1) {
        sb.Append(",");
      }

      if (!(obj instanceof Container) && obj == pointedObj) {
        sb.Append("  <---");
      }

      sb.AppendLine();
    }

    let onlyNamed: Map<string, INamedContent> = new Map();

    for (let [key, value] of this.namedContent) {
      if (this.content.indexOf(asOrThrows(value, InkObject)) >= 0) {
        continue;
      } else {
        onlyNamed.set(key, value);
      }
    }

    if (onlyNamed.size > 0) {
      appendIndentation();
      sb.AppendLine("-- named: --");

      for (let [, value] of onlyNamed) {
        Debug.AssertType(
          value,
          Container,
          "Can only print out named Containers"
        );
        let container = value as Container;
        container.BuildStringOfHierarchy(sb, indentation, pointedObj);
        sb.AppendLine();
      }
    }

    indentation--;

    appendIndentation();
    sb.Append("]");
  }
}

export namespace Container {
  export enum CountFlags {
    Start = 0,
    Visits = 1,
    Turns = 2,
    CountStartOnly = 4,
  }
}

import { InkList, InkListItem } from "./InkList";
import { StoryException } from "./StoryException";
import { tryParseInt, tryParseFloat } from "./TryGetResult";

export abstract class AbstractValue extends InkObject {
  public abstract get valueType(): ValueType;
  public abstract get isTruthy(): boolean;
  public abstract get valueObject(): any;

  public abstract Cast(newType: ValueType): Value<any>;

  public static Create(
    val: any,
    preferredNumberType?: ValueType
  ): Value<any> | null {
    // This code doesn't exist in upstream and is simply here to enforce
    // the creation of the proper number value.
    // If `preferredNumberType` is not provided or if value doesn't match
    // `preferredNumberType`, this conditional does nothing.
    if (preferredNumberType) {
      if (
        preferredNumberType === (ValueType.Int as ValueType) &&
        Number.isInteger(Number(val))
      ) {
        return new IntValue(Number(val));
      } else if (
        preferredNumberType === (ValueType.Float as ValueType) &&
        !isNaN(val)
      ) {
        return new FloatValue(Number(val));
      }
    }

    if (typeof val === "boolean") {
      return new BoolValue(Boolean(val));
    }

    // https://github.com/y-lohse/inkjs/issues/425
    // Changed condition sequence, because Number('') is
    // parsed to 0, which made setting string to empty
    // impossible
    if (typeof val === "string") {
      return new StringValue(String(val));
    } else if (Number.isInteger(Number(val))) {
      return new IntValue(Number(val));
    } else if (!isNaN(val)) {
      return new FloatValue(Number(val));
    } else if (val instanceof Path) {
      return new DivertTargetValue(asOrThrows(val, Path));
    } else if (val instanceof InkList) {
      return new ListValue(asOrThrows(val, InkList));
    }

    return null;
  }
  public Copy() {
    return asOrThrows(AbstractValue.Create(this.valueObject), InkObject);
  }
  public BadCastException(targetType: ValueType) {
    return new StoryException(
      "Can't cast " +
        this.valueObject +
        " from " +
        this.valueType +
        " to " +
        targetType
    );
  }
}

export abstract class Value<
  T extends { toString: () => string },
> extends AbstractValue {
  public value: T | null;

  constructor(val: T | null) {
    super();
    this.value = val;
  }
  public get valueObject() {
    return this.value;
  }
  public toString() {
    if (this.value === null) return throwNullException("Value.value");
    return this.value.toString();
  }
}

export class BoolValue extends Value<boolean> {
  constructor(val: boolean) {
    super(val || false);
  }
  public get isTruthy() {
    return Boolean(this.value);
  }
  public get valueType() {
    return ValueType.Bool;
  }

  public Cast(newType: ValueType): Value<any> {
    if (this.value === null) return throwNullException("Value.value");

    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Int) {
      return new IntValue(this.value ? 1 : 0);
    }

    if (newType == ValueType.Float) {
      return new FloatValue(this.value ? 1.0 : 0.0);
    }

    if (newType == ValueType.String) {
      return new StringValue(this.value ? "true" : "false");
    }

    throw this.BadCastException(newType);
  }

  public toString() {
    return this.value ? "true" : "false";
  }
}

export class IntValue extends Value<number> {
  constructor(val: number) {
    super(val || 0);
  }
  public get isTruthy() {
    return this.value != 0;
  }
  public get valueType() {
    return ValueType.Int;
  }

  public Cast(newType: ValueType): Value<any> {
    if (this.value === null) return throwNullException("Value.value");

    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Bool) {
      return new BoolValue(this.value === 0 ? false : true);
    }

    if (newType == ValueType.Float) {
      return new FloatValue(this.value);
    }

    if (newType == ValueType.String) {
      return new StringValue("" + this.value);
    }

    throw this.BadCastException(newType);
  }
}

export class FloatValue extends Value<number> {
  constructor(val: number) {
    super(val || 0.0);
  }
  public get isTruthy() {
    return this.value != 0.0;
  }
  public get valueType() {
    return ValueType.Float;
  }

  public Cast(newType: ValueType): Value<any> {
    if (this.value === null) return throwNullException("Value.value");

    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Bool) {
      return new BoolValue(this.value === 0.0 ? false : true);
    }

    if (newType == ValueType.Int) {
      return new IntValue(this.value);
    }

    if (newType == ValueType.String) {
      return new StringValue("" + this.value);
    }

    throw this.BadCastException(newType);
  }
}

export class StringValue extends Value<string> {
  public _isNewline: boolean;
  public _isInlineWhitespace: boolean;

  constructor(val: string) {
    super(val || "");

    this._isNewline = this.value == "\n";
    this._isInlineWhitespace = true;

    if (this.value === null) return throwNullException("Value.value");

    if (this.value.length > 0) {
      this.value.split("").every((c) => {
        if (c != " " && c != "\t") {
          this._isInlineWhitespace = false;
          return false;
        }

        return true;
      });
    }
  }
  public get valueType() {
    return ValueType.String;
  }
  public get isTruthy() {
    if (this.value === null) return throwNullException("Value.value");
    return this.value.length > 0;
  }
  public get isNewline() {
    return this._isNewline;
  }
  public get isInlineWhitespace() {
    return this._isInlineWhitespace;
  }
  public get isNonWhitespace() {
    return !this.isNewline && !this.isInlineWhitespace;
  }

  public Cast(newType: ValueType): Value<any> {
    if (newType == this.valueType) {
      return this;
    }

    if (newType == ValueType.Int) {
      let parsedInt = tryParseInt(this.value);
      if (parsedInt.exists) {
        return new IntValue(parsedInt.result);
      } else {
        throw this.BadCastException(newType);
      }
    }

    if (newType == ValueType.Float) {
      let parsedFloat = tryParseFloat(this.value);
      if (parsedFloat.exists) {
        return new FloatValue(parsedFloat.result);
      } else {
        throw this.BadCastException(newType);
      }
    }

    throw this.BadCastException(newType);
  }
}

export class DivertTargetValue extends Value<Path> {
  constructor(targetPath: Path | null = null) {
    super(targetPath);
  }
  public get valueType() {
    return ValueType.DivertTarget;
  }
  public get targetPath() {
    if (this.value === null) return throwNullException("Value.value");
    return this.value;
  }
  public set targetPath(value: Path) {
    this.value = value;
  }
  public get isTruthy(): never {
    throw new Error("Shouldn't be checking the truthiness of a divert target");
  }

  public Cast(newType: ValueType): Value<any> {
    if (newType == this.valueType) return this;

    throw this.BadCastException(newType);
  }
  public toString() {
    return "DivertTargetValue(" + this.targetPath + ")";
  }
}

export class VariablePointerValue extends Value<string> {
  public _contextIndex: number;

  constructor(variableName: string, contextIndex: number = -1) {
    super(variableName);

    this._contextIndex = contextIndex;
  }

  public get contextIndex() {
    return this._contextIndex;
  }
  public set contextIndex(value: number) {
    this._contextIndex = value;
  }
  public get variableName() {
    if (this.value === null) return throwNullException("Value.value");
    return this.value;
  }
  public set variableName(value: string) {
    this.value = value;
  }
  public get valueType() {
    return ValueType.VariablePointer;
  }

  public get isTruthy(): never {
    throw new Error(
      "Shouldn't be checking the truthiness of a variable pointer"
    );
  }

  public Cast(newType: ValueType): Value<any> {
    if (newType == this.valueType) return this;

    throw this.BadCastException(newType);
  }
  public toString() {
    return "VariablePointerValue(" + this.variableName + ")";
  }
  public Copy() {
    return new VariablePointerValue(this.variableName, this.contextIndex);
  }
}

export class ListValue extends Value<InkList> {
  public get isTruthy() {
    if (this.value === null) {
      return throwNullException("this.value");
    }
    return this.value.Count > 0;
  }
  public get valueType() {
    return ValueType.List;
  }
  public Cast(newType: ValueType): Value<any> {
    if (this.value === null) return throwNullException("Value.value");

    if (newType == ValueType.Int) {
      let max = this.value.maxItem;
      if (max.Key.isNull) return new IntValue(0);
      else return new IntValue(max.Value);
    } else if (newType == ValueType.Float) {
      let max = this.value.maxItem;
      if (max.Key.isNull) return new FloatValue(0.0);
      else return new FloatValue(max.Value);
    } else if (newType == ValueType.String) {
      let max = this.value.maxItem;
      if (max.Key.isNull) return new StringValue("");
      else {
        return new StringValue(max.Key.toString());
      }
    }

    if (newType == this.valueType) return this;

    throw this.BadCastException(newType);
  }
  constructor();
  constructor(list: InkList);
  constructor(listOrSingleItem: InkListItem, singleValue: number);
  constructor(listOrSingleItem?: InkListItem | InkList, singleValue?: number) {
    super(null);

    if (!listOrSingleItem && !singleValue) {
      this.value = new InkList();
    } else if (listOrSingleItem instanceof InkList) {
      this.value = new InkList(listOrSingleItem);
    } else if (
      listOrSingleItem instanceof InkListItem &&
      typeof singleValue === "number"
    ) {
      this.value = new InkList({
        Key: listOrSingleItem,
        Value: singleValue,
      });
    }
  }
  public static RetainListOriginsForAssignment(
    oldValue: InkObject | null,
    newValue: InkObject
  ) {
    let oldList = asOrNull(oldValue, ListValue);
    let newList = asOrNull(newValue, ListValue);

    if (newList && newList.value === null)
      return throwNullException("newList.value");
    if (oldList && oldList.value === null)
      return throwNullException("oldList.value");

    // When assigning the empty list, try to retain any initial origin names
    if (oldList && newList && newList.value!.Count == 0)
      newList.value!.SetInitialOriginNames(oldList.value!.originNames);
  }
}

export enum ValueType {
  Bool = -1,
  Int = 0,
  Float = 1,
  List = 2,
  String = 3,
  DivertTarget = 4,
  VariablePointer = 5,
}

export class SearchResult {
  public obj: InkObject | null = null;
  public approximate: boolean = false;

  get correctObj() {
    return this.approximate ? null : this.obj;
  }

  get container() {
    return this.obj instanceof Container ? this.obj : null;
  }

  public copy() {
    let searchResult = new SearchResult();
    searchResult.obj = this.obj;
    searchResult.approximate = this.approximate;

    return searchResult;
  }
}
