import { Container } from "./Object";
import { InkObject } from "./Object";
import { JsonSerialisation } from "./JsonSerialisation";
import { ControlCommand } from "./ControlCommand";
import { PushPopType } from "./PushPop";
import { ChoicePoint } from "./ChoicePoint";
import { Choice } from "./Choice";
import { Divert } from "./Divert";
import {
  Value,
  StringValue,
  IntValue,
  DivertTargetValue,
  VariablePointerValue,
  ListValue,
} from "./Object";
import { Path } from "./Path";
import { Void } from "./Void";
import { Tag } from "./Tag";
import { VariableAssignment } from "./VariableAssignment";
import { VariableReference } from "./VariableReference";
import { NativeFunctionCall } from "./NativeFunctionCall";
import { StoryException } from "./StoryException";
import { PRNG } from "./PRNG";
import { StringBuilder } from "./StringBuilder";
import { ListDefinitionsOrigin } from "./ListDefinitionsOrigin";
import { ListDefinition } from "./ListDefinition";
import { Stopwatch } from "./StopWatch";
import { Pointer } from "./Pointer";
import { InkList, InkListItem, KeyValuePair } from "./InkList";
import { asOrNull, asOrThrows } from "./TypeAssertion";
import { DebugMetadata } from "./DebugMetadata";
import { throwNullException } from "./NullException";
import { SimpleJson } from "./SimpleJson";
import { ErrorHandler, ErrorType } from "./Error";

export { InkList } from "./InkList";

if (!Number.isInteger) {
  Number.isInteger = function isInteger(nVal: any) {
    return (
      typeof nVal === "number" &&
      isFinite(nVal) &&
      nVal > -9007199254740992 &&
      nVal < 9007199254740992 &&
      Math.floor(nVal) === nVal
    );
  };
}

export class Story extends InkObject {
  public static inkVersionCurrent = 21;

  public inkVersionMinimumCompatible = 18;

  get currentChoices() {
    let choices: Choice[] = [];

    if (this._state === null) {
      return throwNullException("this._state");
    }
    for (let c of this._state.currentChoices) {
      if (!c.isInvisibleDefault) {
        c.index = choices.length;
        choices.push(c);
      }
    }

    return choices;
  }

  get currentText() {
    this.IfAsyncWeCant("call currentText since it's a work in progress");
    return this.state.currentText;
  }

  get currentTags() {
    this.IfAsyncWeCant("call currentTags since it's a work in progress");
    return this.state.currentTags;
  }

  get currentErrors() {
    return this.state.currentErrors;
  }

  get currentWarnings() {
    return this.state.currentWarnings;
  }

  get currentFlowName() {
    return this.state.currentFlowName;
  }

  get currentFlowIsDefaultFlow() {
    return this.state.currentFlowIsDefaultFlow;
  }

  get aliveFlowNames() {
    return this.state.aliveFlowNames;
  }

  get hasError() {
    return this.state.hasError;
  }

  get hasWarning() {
    return this.state.hasWarning;
  }

  get variablesState() {
    return this.state.variablesState;
  }

  get listDefinitions() {
    return this._listDefinitions;
  }

  get state() {
    return this._state;
  }

  public onError: ErrorHandler | null = null;

  public onDidContinue: (() => void) | null = null;

  public onMakeChoice: ((arg1: Choice) => void) | null = null;

  public onEvaluateFunction: ((arg1: string, arg2: any[]) => void) | null =
    null;

  public onCompleteEvaluateFunction:
    | ((arg1: string, arg2: any[], arg3: string, arg4: any) => void)
    | null = null;

  public onChoosePathString: ((arg1: string, arg2: any[]) => void) | null =
    null;

  // TODO: Implement Profiler
  public StartProfiling() {
    /* */
  }
  public EndProfiling() {
    /* */
  }

  constructor(contentContainer: Container, lists: ListDefinition[] | null);
  constructor(jsonString: string);
  constructor(json: Record<string, any>);
  constructor() {
    super();

    // Discrimination between constructors
    let contentContainer: Container;
    let lists: ListDefinition[] | null = null;
    let json: Record<string, any> | null = null;

    if (arguments[0] instanceof Container) {
      contentContainer = arguments[0] as Container;

      if (typeof arguments[1] !== "undefined") {
        lists = arguments[1] as ListDefinition[];
      }

      // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
      this._mainContentContainer = contentContainer;
      // ------
    } else {
      if (typeof arguments[0] === "string") {
        let jsonString = arguments[0] as string;

        json = SimpleJson.TextToDictionary(jsonString);
      } else {
        json = arguments[0] as Record<string, any>;
      }
    }

    // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
    if (lists != null) this._listDefinitions = new ListDefinitionsOrigin(lists);

    this._externals = new Map();
    // ------

    // ------ Story(string jsonString) : this((Container)null)
    if (json !== null) {
      let rootObject: Record<string, any> = json;

      let versionObj = rootObject["inkVersion"];
      if (versionObj == null)
        throw new Error(
          "ink version number not found. Are you sure it's a valid .ink.json file?"
        );

      let formatFromFile = parseInt(versionObj);
      if (formatFromFile > Story.inkVersionCurrent) {
        throw new Error(
          "Version of ink used to build story was newer than the current version of the engine"
        );
      } else if (formatFromFile < this.inkVersionMinimumCompatible) {
        throw new Error(
          "Version of ink used to build story is too old to be loaded by this version of the engine"
        );
      } else if (formatFromFile != Story.inkVersionCurrent) {
        console.warn(
          `WARNING: Version of ink ${Story.inkVersionCurrent} used to build story doesn't match current version of engine (${formatFromFile}). Non-critical, but recommend synchronising.`
        );
      }

      let rootToken = rootObject["root"];
      if (rootToken == null)
        throw new Error(
          "Root node for ink not found. Are you sure it's a valid .ink.json file?"
        );

      let listDefsObj;
      if ((listDefsObj = rootObject["listDefs"])) {
        this._listDefinitions =
          JsonSerialisation.JTokenToListDefinitions(listDefsObj);
      }

      this._mainContentContainer = asOrThrows(
        JsonSerialisation.JTokenToRuntimeObject(rootToken),
        Container
      );

      this.ResetState();
    }
    // ------
  }

  // Merge together `public string ToJson()` and `void ToJson(SimpleJson.Writer writer)`.
  // Will only return a value if writer was not provided.
  public ToJson(writer?: SimpleJson.Writer): string | void {
    let shouldReturn = false;

    if (!writer) {
      shouldReturn = true;
      writer = new SimpleJson.Writer();
    }

    writer.WriteObjectStart();

    writer.WriteIntProperty("inkVersion", Story.inkVersionCurrent);

    writer.WriteProperty("root", (w) =>
      JsonSerialisation.WriteRuntimeContainer(w, this._mainContentContainer)
    );

    if (this._listDefinitions != null) {
      writer.WritePropertyStart("listDefs");
      writer.WriteObjectStart();

      for (let def of this._listDefinitions.lists) {
        writer.WritePropertyStart(def.name);
        writer.WriteObjectStart();

        for (let [key, value] of def.items) {
          let item = InkListItem.fromSerializedKey(key);
          let val = value;
          writer.WriteIntProperty(item.itemName, val);
        }

        writer.WriteObjectEnd();
        writer.WritePropertyEnd();
      }

      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    writer.WriteObjectEnd();

    if (shouldReturn) return writer.toString();
  }

  public ResetState() {
    this.IfAsyncWeCant("ResetState");

    this._state = new StoryState(this);
    this._state.variablesState.ObserveVariableChange(
      this.VariableStateDidChangeEvent.bind(this)
    );

    this.ResetGlobals();
  }

  public ResetErrors() {
    if (this._state === null) {
      return throwNullException("this._state");
    }
    this._state.ResetErrors();
  }

  public ResetCallstack() {
    this.IfAsyncWeCant("ResetCallstack");
    if (this._state === null) {
      return throwNullException("this._state");
    }
    this._state.ForceEnd();
  }

  public ResetGlobals() {
    if (this._mainContentContainer.namedContent.get("global decl")) {
      let originalPointer = this.state.currentPointer.copy();

      this.ChoosePath(new Path("global decl"), false);

      this.ContinueInternal();

      this.state.currentPointer = originalPointer;
    }

    this.state.variablesState.SnapshotDefaultGlobals();
  }

  public SwitchFlow(flowName: string) {
    this.IfAsyncWeCant("switch flow");
    if (this._asyncSaving) {
      throw new Error(
        "Story is already in background saving mode, can't switch flow to " +
          flowName
      );
    }

    this.state.SwitchFlow_Internal(flowName);
  }

  public RemoveFlow(flowName: string) {
    this.state.RemoveFlow_Internal(flowName);
  }

  public SwitchToDefaultFlow() {
    this.state.SwitchToDefaultFlow_Internal();
  }

  public Continue() {
    this.ContinueAsync(0);
    return this.currentText;
  }

  get canContinue() {
    return this.state.canContinue;
  }

  get asyncContinueComplete() {
    return !this._asyncContinueActive;
  }

  public ContinueAsync(millisecsLimitAsync: number) {
    if (!this._hasValidatedExternals) this.ValidateExternalBindings();

    this.ContinueInternal(millisecsLimitAsync);
  }

  public ContinueInternal(millisecsLimitAsync = 0) {
    if (this._profiler != null) this._profiler.PreContinue();

    let isAsyncTimeLimited = millisecsLimitAsync > 0;
    this._recursiveContinueCount++;

    if (!this._asyncContinueActive) {
      this._asyncContinueActive = isAsyncTimeLimited;

      if (!this.canContinue) {
        throw new Error(
          "Can't continue - should check canContinue before calling Continue"
        );
      }

      this._state.didSafeExit = false;
      this._state.ResetOutput();

      if (this._recursiveContinueCount == 1)
        this._state.variablesState.StartVariableObservation();
    } else if (this._asyncContinueActive && !isAsyncTimeLimited) {
      this._asyncContinueActive = false;
    }

    let durationStopwatch = new Stopwatch();
    durationStopwatch.Start();

    let outputStreamEndsInNewline = false;
    this._sawLookaheadUnsafeFunctionAfterNewline = false;
    do {
      try {
        outputStreamEndsInNewline = this.ContinueSingleStep();
      } catch (e) {
        if (!(e instanceof StoryException)) throw e;

        this.AddError(e.message, undefined, e.useEndLineNumber);
        break;
      }

      if (outputStreamEndsInNewline) break;

      if (
        this._asyncContinueActive &&
        durationStopwatch.ElapsedMilliseconds > millisecsLimitAsync
      ) {
        break;
      }
    } while (this.canContinue);

    durationStopwatch.Stop();

    let changedVariablesToObserve: Map<string, any> | null = null;

    if (outputStreamEndsInNewline || !this.canContinue) {
      if (this._stateSnapshotAtLastNewline !== null) {
        this.RestoreStateSnapshot();
      }

      if (!this.canContinue) {
        if (this.state.callStack.canPopThread)
          this.AddError(
            "Thread available to pop, threads should always be flat by the end of evaluation?"
          );

        if (
          this.state.generatedChoices.length == 0 &&
          !this.state.didSafeExit &&
          this._temporaryEvaluationContainer == null
        ) {
          if (this.state.callStack.CanPop(PushPopType.Tunnel))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '->->' to return from a tunnel?"
            );
          else if (this.state.callStack.CanPop(PushPopType.Function))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '~ return'?"
            );
          else if (!this.state.callStack.canPop)
            this.AddError(
              "ran out of content. Do you need a '-> DONE' or '-> END'?"
            );
          else
            this.AddError(
              "unexpectedly reached end of content for unknown reason. Please debug compiler!"
            );
        }
      }

      this.state.didSafeExit = false;
      this._sawLookaheadUnsafeFunctionAfterNewline = false;

      if (this._recursiveContinueCount == 1)
        changedVariablesToObserve =
          this._state.variablesState.CompleteVariableObservation();

      this._asyncContinueActive = false;
      if (this.onDidContinue !== null) this.onDidContinue();
    }

    this._recursiveContinueCount--;

    if (this._profiler != null) this._profiler.PostContinue();

    // In the following code, we're masking a lot of non-null assertion,
    // because testing for against `hasError` or `hasWarning` makes sure
    // the arrays are present and contain at least one element.
    if (this.state.hasError || this.state.hasWarning) {
      if (this.onError !== null) {
        if (this.state.hasError) {
          for (let err of this.state.currentErrors!) {
            this.onError(err, ErrorType.Error);
          }
        }
        if (this.state.hasWarning) {
          for (let err of this.state.currentWarnings!) {
            this.onError(err, ErrorType.Warning);
          }
        }
        this.ResetErrors();
      } else {
        let sb = new StringBuilder();
        sb.Append("Ink had ");
        if (this.state.hasError) {
          sb.Append(`${this.state.currentErrors!.length}`);
          sb.Append(
            this.state.currentErrors!.length == 1 ? " error" : " errors"
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        if (this.state.hasWarning) {
          sb.Append(`${this.state.currentWarnings!.length}`);
          sb.Append(
            this.state.currentWarnings!.length == 1 ? " warning" : " warnings"
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        sb.Append(
          ". It is strongly suggested that you assign an error handler to story.onError. The first issue was: "
        );
        sb.Append(
          this.state.hasError
            ? this.state.currentErrors![0]
            : this.state.currentWarnings![0]
        );

        throw new StoryException(sb.toString());
      }
    }
    if (
      changedVariablesToObserve != null &&
      Object.keys(changedVariablesToObserve).length > 0
    ) {
      this._state.variablesState.NotifyObservers(changedVariablesToObserve);
    }
  }

  public ContinueSingleStep() {
    if (this._profiler != null) this._profiler.PreStep();

    this.Step();

    if (this._profiler != null) this._profiler.PostStep();

    if (!this.canContinue && !this.state.callStack.elementIsEvaluateFromGame) {
      this.TryFollowDefaultInvisibleChoice();
    }

    if (this._profiler != null) this._profiler.PreSnapshot();

    if (!this.state.inStringEvaluation) {
      if (this._stateSnapshotAtLastNewline !== null) {
        if (this._stateSnapshotAtLastNewline.currentTags === null) {
          return throwNullException("this._stateAtLastNewline.currentTags");
        }
        if (this.state.currentTags === null) {
          return throwNullException("this.state.currentTags");
        }

        let change = this.CalculateNewlineOutputStateChange(
          this._stateSnapshotAtLastNewline.currentText,
          this.state.currentText,
          this._stateSnapshotAtLastNewline.currentTags.length,
          this.state.currentTags.length
        );

        if (
          change == Story.OutputStateChange.ExtendedBeyondNewline ||
          this._sawLookaheadUnsafeFunctionAfterNewline
        ) {
          this.RestoreStateSnapshot();

          return true;
        } else if (change == Story.OutputStateChange.NewlineRemoved) {
          this.DiscardSnapshot();
        }
      }

      if (this.state.outputStreamEndsInNewline) {
        if (this.canContinue) {
          if (this._stateSnapshotAtLastNewline == null) this.StateSnapshot();
        } else {
          this.DiscardSnapshot();
        }
      }
    }

    if (this._profiler != null) this._profiler.PostSnapshot();

    return false;
  }

  public CalculateNewlineOutputStateChange(
    prevText: string | null,
    currText: string | null,
    prevTagCount: number,
    currTagCount: number
  ) {
    if (prevText === null) {
      return throwNullException("prevText");
    }
    if (currText === null) {
      return throwNullException("currText");
    }

    let newlineStillExists =
      currText.length >= prevText.length &&
      prevText.length > 0 &&
      currText.charAt(prevText.length - 1) == "\n";
    if (
      prevTagCount == currTagCount &&
      prevText.length == currText.length &&
      newlineStillExists
    )
      return Story.OutputStateChange.NoChange;

    if (!newlineStillExists) {
      return Story.OutputStateChange.NewlineRemoved;
    }

    if (currTagCount > prevTagCount)
      return Story.OutputStateChange.ExtendedBeyondNewline;

    for (let i = prevText.length; i < currText.length; i++) {
      let c = currText.charAt(i);
      if (c != " " && c != "\t") {
        return Story.OutputStateChange.ExtendedBeyondNewline;
      }
    }

    return Story.OutputStateChange.NoChange;
  }

  public ContinueMaximally() {
    this.IfAsyncWeCant("ContinueMaximally");

    let sb = new StringBuilder();

    while (this.canContinue) {
      sb.Append(this.Continue());
    }

    return sb.toString();
  }

  public ContentAtPath(path: Path) {
    return this.mainContentContainer.ContentAtPath(path);
  }

  public KnotContainerWithName(name: string) {
    let namedContainer = this.mainContentContainer.namedContent.get(name);
    if (namedContainer instanceof Container) return namedContainer;
    else return null;
  }

  public PointerAtPath(path: Path) {
    if (path.length == 0) return Pointer.Null;

    let p = new Pointer();

    let pathLengthToUse = path.length;

    let result = null;
    if (path.lastComponent === null) {
      return throwNullException("path.lastComponent");
    }

    if (path.lastComponent.isIndex) {
      pathLengthToUse = path.length - 1;
      result = this.mainContentContainer.ContentAtPath(
        path,
        undefined,
        pathLengthToUse
      );
      p.container = result.container;
      p.index = path.lastComponent.index;
    } else {
      result = this.mainContentContainer.ContentAtPath(path);
      p.container = result.container;
      p.index = -1;
    }

    if (
      result.obj == null ||
      (result.obj == this.mainContentContainer && pathLengthToUse > 0)
    ) {
      this.Error(
        "Failed to find content at path '" +
          path +
          "', and no approximation of it was possible."
      );
    } else if (result.approximate)
      this.Warning(
        "Failed to find content at path '" +
          path +
          "', so it was approximated to: '" +
          result.obj.path +
          "'."
      );

    return p;
  }

  public StateSnapshot() {
    this._stateSnapshotAtLastNewline = this._state;
    this._state = this._state.CopyAndStartPatching(false);
  }

  public RestoreStateSnapshot() {
    if (this._stateSnapshotAtLastNewline === null) {
      throwNullException("_stateSnapshotAtLastNewline");
    }
    this._stateSnapshotAtLastNewline.RestoreAfterPatch();

    this._state = this._stateSnapshotAtLastNewline;
    this._stateSnapshotAtLastNewline = null;

    if (!this._asyncSaving) {
      this._state.ApplyAnyPatch();
    }
  }

  public DiscardSnapshot() {
    if (!this._asyncSaving) this._state.ApplyAnyPatch();

    this._stateSnapshotAtLastNewline = null;
  }

  public CopyStateForBackgroundThreadSave() {
    this.IfAsyncWeCant("start saving on a background thread");

    if (this._asyncSaving)
      throw new Error(
        "Story is already in background saving mode, can't call CopyStateForBackgroundThreadSave again!"
      );

    let stateToSave = this._state;
    this._state = this._state.CopyAndStartPatching(true);
    this._asyncSaving = true;
    return stateToSave;
  }

  public BackgroundSaveComplete() {
    if (this._stateSnapshotAtLastNewline === null) {
      this._state.ApplyAnyPatch();
    }

    this._asyncSaving = false;
  }

  public Step() {
    let shouldAddToStream = true;

    let pointer = this.state.currentPointer.copy();
    if (pointer.isNull) {
      return;
    }

    // Container containerToEnter = pointer.Resolve () as Container;
    let containerToEnter = asOrNull(pointer.Resolve(), Container);

    while (containerToEnter) {
      this.VisitContainer(containerToEnter, true);

      // No content? the most we can do is step past it
      if (containerToEnter.content.length == 0) {
        break;
      }

      pointer = Pointer.StartOf(containerToEnter);
      // containerToEnter = pointer.Resolve() as Container;
      containerToEnter = asOrNull(pointer.Resolve(), Container);
    }

    this.state.currentPointer = pointer.copy();

    if (this._profiler != null) this._profiler.Step(this.state.callStack);

    // Is the current content object:
    //  - Normal content
    //  - Or a logic/flow statement - if so, do it
    // Stop flow if we hit a stack pop when we're unable to pop (e.g. return/done statement in knot
    // that was diverted to rather than called as a function)
    let currentContentObj = pointer.Resolve();
    let isLogicOrFlowControl =
      this.PerformLogicAndFlowControl(currentContentObj);

    // Has flow been forced to end by flow control above?
    if (this.state.currentPointer.isNull) {
      return;
    }

    if (isLogicOrFlowControl) {
      shouldAddToStream = false;
    }

    // Choice with condition?
    // var choicePoint = currentContentObj as ChoicePoint;
    let choicePoint = asOrNull(currentContentObj, ChoicePoint);
    if (choicePoint) {
      let choice = this.ProcessChoice(choicePoint);
      if (choice) {
        this.state.generatedChoices.push(choice);
      }

      currentContentObj = null;
      shouldAddToStream = false;
    }

    // If the container has no content, then it will be
    // the "content" itself, but we skip over it.
    if (currentContentObj instanceof Container) {
      shouldAddToStream = false;
    }

    // Content to add to evaluation stack or the output stream
    if (shouldAddToStream) {
      // If we're pushing a variable pointer onto the evaluation stack, ensure that it's specific
      // to our current (possibly temporary) context index. And make a copy of the pointer
      // so that we're not editing the original runtime object.
      // var varPointer = currentContentObj as VariablePointerValue;
      let varPointer = asOrNull(currentContentObj, VariablePointerValue);
      if (varPointer && varPointer.contextIndex == -1) {
        // Create new object so we're not overwriting the story's own data
        let contextIdx = this.state.callStack.ContextForVariableNamed(
          varPointer.variableName
        );
        currentContentObj = new VariablePointerValue(
          varPointer.variableName,
          contextIdx
        );
      }

      // Expression evaluation content
      if (this.state.inExpressionEvaluation) {
        this.state.PushEvaluationStack(currentContentObj);
      }
      // Output stream content (i.e. not expression evaluation)
      else {
        this.state.PushToOutputStream(currentContentObj);
      }
    }

    // Increment the content pointer, following diverts if necessary
    this.NextContent();

    // Starting a thread should be done after the increment to the content pointer,
    // so that when returning from the thread, it returns to the content after this instruction.
    // var controlCmd = currentContentObj as ;
    let controlCmd = asOrNull(currentContentObj, ControlCommand);
    if (
      controlCmd &&
      controlCmd.commandType == ControlCommand.CommandType.StartThread
    ) {
      this.state.callStack.PushThread();
    }
  }

  public VisitContainer(container: Container, atStart: boolean) {
    if (!container.countingAtStartOnly || atStart) {
      if (container.visitsShouldBeCounted)
        this.state.IncrementVisitCountForContainer(container);

      if (container.turnIndexShouldBeCounted)
        this.state.RecordTurnIndexVisitToContainer(container);
    }
  }

  private _prevContainers: Container[] = [];
  public VisitChangedContainersDueToDivert() {
    let previousPointer = this.state.previousPointer.copy();
    let pointer = this.state.currentPointer.copy();

    if (pointer.isNull || pointer.index == -1) return;

    this._prevContainers.length = 0;
    if (!previousPointer.isNull) {
      // Container prevAncestor = previousPointer.Resolve() as Container ?? previousPointer.container as Container;
      let resolvedPreviousAncestor = previousPointer.Resolve();
      let prevAncestor =
        asOrNull(resolvedPreviousAncestor, Container) ||
        asOrNull(previousPointer.container, Container);
      while (prevAncestor) {
        this._prevContainers.push(prevAncestor);
        // prevAncestor = prevAncestor.parent as Container;
        prevAncestor = asOrNull(prevAncestor.parent, Container);
      }
    }

    let currentChildOfContainer = pointer.Resolve();

    if (currentChildOfContainer == null) return;

    // Container currentContainerAncestor = currentChildOfContainer.parent as Container;
    let currentContainerAncestor = asOrNull(
      currentChildOfContainer.parent,
      Container
    );
    let allChildrenEnteredAtStart = true;
    while (
      currentContainerAncestor &&
      (this._prevContainers.indexOf(currentContainerAncestor) < 0 ||
        currentContainerAncestor.countingAtStartOnly)
    ) {
      // Check whether this ancestor container is being entered at the start,
      // by checking whether the child object is the first.
      let enteringAtStart =
        currentContainerAncestor.content.length > 0 &&
        currentChildOfContainer == currentContainerAncestor.content[0] &&
        allChildrenEnteredAtStart;

      if (!enteringAtStart) allChildrenEnteredAtStart = false;

      // Mark a visit to this container
      this.VisitContainer(currentContainerAncestor, enteringAtStart);

      currentChildOfContainer = currentContainerAncestor;
      // currentContainerAncestor = currentContainerAncestor.parent as Container;
      currentContainerAncestor = asOrNull(
        currentContainerAncestor.parent,
        Container
      );
    }
  }

  public PopChoiceStringAndTags(tags: string[]) {
    let choiceOnlyStrVal = asOrThrows(
      this.state.PopEvaluationStack(),
      StringValue
    );

    while (
      this.state.evaluationStack.length > 0 &&
      asOrNull(this.state.PeekEvaluationStack(), Tag) != null
    ) {
      let tag = asOrNull(this.state.PopEvaluationStack(), Tag);
      if (tag) tags.push(tag.text);
    }
    return choiceOnlyStrVal.value;
  }

  public ProcessChoice(choicePoint: ChoicePoint) {
    let showChoice = true;

    // Don't create choice if choice point doesn't pass conditional
    if (choicePoint.hasCondition) {
      let conditionValue = this.state.PopEvaluationStack();
      if (!this.IsTruthy(conditionValue)) {
        showChoice = false;
      }
    }

    let startText = "";
    let choiceOnlyText = "";
    let tags: string[] = [];

    if (choicePoint.hasChoiceOnlyContent) {
      choiceOnlyText = this.PopChoiceStringAndTags(tags) || "";
    }

    if (choicePoint.hasStartContent) {
      startText = this.PopChoiceStringAndTags(tags) || "";
    }

    // Don't create choice if player has already read this content
    if (choicePoint.onceOnly) {
      let visitCount = this.state.VisitCountForContainer(
        choicePoint.choiceTarget
      );
      if (visitCount > 0) {
        showChoice = false;
      }
    }

    // We go through the full process of creating the choice above so
    // that we consume the content for it, since otherwise it'll
    // be shown on the output stream.
    if (!showChoice) {
      return null;
    }

    let choice = new Choice();
    choice.targetPath = choicePoint.pathOnChoice;
    choice.sourcePath = choicePoint.path.toString();
    choice.isInvisibleDefault = choicePoint.isInvisibleDefault;
    choice.threadAtGeneration = this.state.callStack.ForkThread();
    choice.tags = tags.reverse(); //C# is a stack
    choice.text = (startText + choiceOnlyText).replace(/^[ \t]+|[ \t]+$/g, "");

    return choice;
  }

  public IsTruthy(obj: InkObject) {
    let truthy = false;
    if (obj instanceof Value) {
      let val = obj;

      if (val instanceof DivertTargetValue) {
        let divTarget = val;
        this.Error(
          "Shouldn't use a divert target (to " +
            divTarget.targetPath +
            ") as a conditional value. Did you intend a function call 'likeThis()' or a read count check 'likeThis'? (no arrows)"
        );
        return false;
      }

      return val.isTruthy;
    }
    return truthy;
  }

  public PerformLogicAndFlowControl(contentObj: InkObject | null) {
    if (contentObj == null) {
      return false;
    }

    // Divert
    if (contentObj instanceof Divert) {
      let currentDivert = contentObj;

      if (currentDivert.isConditional) {
        let conditionValue = this.state.PopEvaluationStack();

        // False conditional? Cancel divert
        if (!this.IsTruthy(conditionValue)) return true;
      }

      if (currentDivert.hasVariableTarget) {
        let varName = currentDivert.variableDivertName;

        let varContents =
          this.state.variablesState.GetVariableWithName(varName);

        if (varContents == null) {
          this.Error(
            "Tried to divert using a target from a variable that could not be found (" +
              varName +
              ")"
          );
        } else if (!(varContents instanceof DivertTargetValue)) {
          // var intContent = varContents as IntValue;
          let intContent = asOrNull(varContents, IntValue);

          let errorMessage =
            "Tried to divert to a target from a variable, but the variable (" +
            varName +
            ") didn't contain a divert target, it ";
          if (intContent instanceof IntValue && intContent.value == 0) {
            errorMessage += "was empty/null (the value 0).";
          } else {
            errorMessage += "contained '" + varContents + "'.";
          }

          this.Error(errorMessage);
        }

        let target = asOrThrows(varContents, DivertTargetValue);
        this.state.divertedPointer = this.PointerAtPath(target.targetPath);
      } else if (currentDivert.isExternal) {
        this.CallExternalFunction(
          currentDivert.targetPathString,
          currentDivert.externalArgs
        );
        return true;
      } else {
        this.state.divertedPointer = currentDivert.targetPointer.copy();
      }

      if (currentDivert.pushesToStack) {
        this.state.callStack.Push(
          currentDivert.stackPushType,
          undefined,
          this.state.outputStream.length
        );
      }

      if (this.state.divertedPointer.isNull && !currentDivert.isExternal) {
        if (
          currentDivert &&
          currentDivert.debugMetadata &&
          currentDivert.debugMetadata.sourceName != null
        ) {
          this.Error(
            "Divert target doesn't exist: " +
              currentDivert.debugMetadata.sourceName
          );
        } else {
          this.Error("Divert resolution failed: " + currentDivert);
        }
      }

      return true;
    }

    // Start/end an expression evaluation? Or print out the result?
    else if (contentObj instanceof ControlCommand) {
      let evalCommand = contentObj;

      switch (evalCommand.commandType) {
        case ControlCommand.CommandType.EvalStart:
          this.Assert(
            this.state.inExpressionEvaluation === false,
            "Already in expression evaluation?"
          );
          this.state.inExpressionEvaluation = true;
          break;

        case ControlCommand.CommandType.EvalEnd:
          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Not in expression evaluation mode"
          );
          this.state.inExpressionEvaluation = false;
          break;

        case ControlCommand.CommandType.EvalOutput:
          // If the expression turned out to be empty, there may not be anything on the stack
          if (this.state.evaluationStack.length > 0) {
            let output = this.state.PopEvaluationStack();

            // Functions may evaluate to Void, in which case we skip output
            if (!(output instanceof Void)) {
              // TODO: Should we really always blanket convert to string?
              // It would be okay to have numbers in the output stream the
              // only problem is when exporting text for viewing, it skips over numbers etc.
              let text = new StringValue(output.toString());

              this.state.PushToOutputStream(text);
            }
          }
          break;

        case ControlCommand.CommandType.NoOp:
          break;

        case ControlCommand.CommandType.Duplicate:
          this.state.PushEvaluationStack(this.state.PeekEvaluationStack());
          break;

        case ControlCommand.CommandType.PopEvaluatedValue:
          this.state.PopEvaluationStack();
          break;

        case ControlCommand.CommandType.PopFunction:
        case ControlCommand.CommandType.PopTunnel:
          let popType =
            evalCommand.commandType == ControlCommand.CommandType.PopFunction
              ? PushPopType.Function
              : PushPopType.Tunnel;

          let overrideTunnelReturnTarget: DivertTargetValue | null = null;
          if (popType == PushPopType.Tunnel) {
            let popped = this.state.PopEvaluationStack();
            // overrideTunnelReturnTarget = popped as DivertTargetValue;
            overrideTunnelReturnTarget = asOrNull(popped, DivertTargetValue);
            if (overrideTunnelReturnTarget === null) {
              this.Assert(
                popped instanceof Void,
                "Expected void if ->-> doesn't override target"
              );
            }
          }

          if (this.state.TryExitFunctionEvaluationFromGame()) {
            break;
          } else if (
            this.state.callStack.currentElement.type != popType ||
            !this.state.callStack.canPop
          ) {
            let names: Map<PushPopType, string> = new Map();
            names.set(
              PushPopType.Function,
              "function return statement (~ return)"
            );
            names.set(PushPopType.Tunnel, "tunnel onwards statement (->->)");

            let expected = names.get(this.state.callStack.currentElement.type);
            if (!this.state.callStack.canPop) {
              expected = "end of flow (-> END or choice)";
            }

            let errorMsg =
              "Found " + names.get(popType) + ", when expected " + expected;

            this.Error(errorMsg);
          } else {
            this.state.PopCallStack();

            if (overrideTunnelReturnTarget)
              this.state.divertedPointer = this.PointerAtPath(
                overrideTunnelReturnTarget.targetPath
              );
          }
          break;

        case ControlCommand.CommandType.BeginString:
          this.state.PushToOutputStream(evalCommand);

          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Expected to be in an expression when evaluating a string"
          );
          this.state.inExpressionEvaluation = false;
          break;

        // Leave it to story.currentText and story.currentTags to sort out the text from the tags
        // This is mostly because we can't always rely on the existence of EndTag, and we don't want
        // to try and flatten dynamic tags to strings every time \n is pushed to output
        case ControlCommand.CommandType.BeginTag:
          this.state.PushToOutputStream(evalCommand);
          break;

        // EndTag has 2 modes:
        //  - When in string evaluation (for choices)
        //  - Normal
        //
        // The only way you could have an EndTag in the middle of
        // string evaluation is if we're currently generating text for a
        // choice, such as:
        //
        //   + choice # tag
        //
        // In the above case, the ink will be run twice:
        //  - First, to generate the choice text. String evaluation
        //    will be on, and the final string will be pushed to the
        //    evaluation stack, ready to be popped to make a Choice
        //    object.
        //  - Second, when ink generates text after choosing the choice.
        //    On this ocassion, it's not in string evaluation mode.
        //
        // On the writing side, we disallow manually putting tags within
        // strings like this:
        //
        //   {"hello # world"}
        //
        // So we know that the tag must be being generated as part of
        // choice content. Therefore, when the tag has been generated,
        // we push it onto the evaluation stack in the exact same way
        // as the string for the choice content.
        case ControlCommand.CommandType.EndTag: {
          if (this.state.inStringEvaluation) {
            let contentStackForTag: InkObject[] = [];
            let outputCountConsumed = 0;
            for (let i = this.state.outputStream.length - 1; i >= 0; --i) {
              let obj = this.state.outputStream[i];
              outputCountConsumed++;

              // var command = obj as ControlCommand;
              let command = asOrNull(obj, ControlCommand);
              if (command != null) {
                if (
                  command.commandType == ControlCommand.CommandType.BeginTag
                ) {
                  break;
                } else {
                  this.Error(
                    "Unexpected ControlCommand while extracting tag from choice"
                  );
                  break;
                }
              }
              if (obj instanceof StringValue) {
                contentStackForTag.push(obj);
              }
            }

            // Consume the content that was produced for this string
            this.state.PopFromOutputStream(outputCountConsumed);
            // Build string out of the content we collected
            let sb = new StringBuilder();
            for (let strVal of contentStackForTag.reverse()) {
              sb.Append(strVal.toString());
            }
            let choiceTag = new Tag(
              this.state.CleanOutputWhitespace(sb.toString())
            );
            // Pushing to the evaluation stack means it gets picked up
            // when a Choice is generated from the next Choice Point.
            this.state.PushEvaluationStack(choiceTag);
          } else {
            // Otherwise! Simply push EndTag, so that in the output stream we
            // have a structure of: [BeginTag, "the tag content", EndTag]
            this.state.PushToOutputStream(evalCommand);
          }
          break;
        }

        case ControlCommand.CommandType.EndString: {
          let contentStackForString: InkObject[] = [];
          let contentToRetain: InkObject[] = [];

          let outputCountConsumed = 0;
          for (let i = this.state.outputStream.length - 1; i >= 0; --i) {
            let obj = this.state.outputStream[i];

            outputCountConsumed++;

            // var command = obj as ControlCommand;
            let command = asOrNull(obj, ControlCommand);
            if (
              command &&
              command.commandType == ControlCommand.CommandType.BeginString
            ) {
              break;
            }
            if (obj instanceof Tag) {
              contentToRetain.push(obj);
            }
            if (obj instanceof StringValue) {
              contentStackForString.push(obj);
            }
          }

          // Consume the content that was produced for this string
          this.state.PopFromOutputStream(outputCountConsumed);

          // Rescue the tags that we want actually to keep on the output stack
          // rather than consume as part of the string we're building.
          // At the time of writing, this only applies to Tag objects generated
          // by choices, which are pushed to the stack during string generation.
          for (let rescuedTag of contentToRetain)
            this.state.PushToOutputStream(rescuedTag);

          // The C# version uses a Stack for contentStackForString, but we're
          // using a simple array, so we need to reverse it before using it
          contentStackForString = contentStackForString.reverse();

          // Build string out of the content we collected
          let sb = new StringBuilder();
          for (let c of contentStackForString) {
            sb.Append(c.toString());
          }

          // Return to expression evaluation (from content mode)
          this.state.inExpressionEvaluation = true;
          this.state.PushEvaluationStack(new StringValue(sb.toString()));
          break;
        }

        case ControlCommand.CommandType.ChoiceCount:
          let choiceCount = this.state.generatedChoices.length;
          this.state.PushEvaluationStack(new IntValue(choiceCount));
          break;

        case ControlCommand.CommandType.Turns:
          this.state.PushEvaluationStack(
            new IntValue(this.state.currentTurnIndex + 1)
          );
          break;

        case ControlCommand.CommandType.TurnsSince:
        case ControlCommand.CommandType.ReadCount:
          let target = this.state.PopEvaluationStack();
          if (!(target instanceof DivertTargetValue)) {
            let extraNote = "";
            if (target instanceof IntValue)
              extraNote =
                ". Did you accidentally pass a read count ('knot_name') instead of a target ('-> knot_name')?";
            this.Error(
              "TURNS_SINCE / READ_COUNT expected a divert target (knot, stitch, label name), but saw " +
                target +
                extraNote
            );
            break;
          }

          // var divertTarget = target as DivertTargetValue;
          let divertTarget = asOrThrows(target, DivertTargetValue);
          // var container = ContentAtPath (divertTarget.targetPath).correctObj as Container;
          let container = asOrNull(
            this.ContentAtPath(divertTarget.targetPath).correctObj,
            Container
          );

          let eitherCount;
          if (container != null) {
            if (
              evalCommand.commandType == ControlCommand.CommandType.TurnsSince
            )
              eitherCount = this.state.TurnsSinceForContainer(container);
            else eitherCount = this.state.VisitCountForContainer(container);
          } else {
            if (
              evalCommand.commandType == ControlCommand.CommandType.TurnsSince
            )
              eitherCount = -1;
            else eitherCount = 0;

            this.Warning(
              "Failed to find container for " +
                evalCommand.toString() +
                " lookup at " +
                divertTarget.targetPath.toString()
            );
          }

          this.state.PushEvaluationStack(new IntValue(eitherCount));
          break;

        case ControlCommand.CommandType.Random: {
          let maxInt = asOrNull(this.state.PopEvaluationStack(), IntValue);
          let minInt = asOrNull(this.state.PopEvaluationStack(), IntValue);

          if (minInt == null || minInt instanceof IntValue === false)
            return this.Error(
              "Invalid value for minimum parameter of RANDOM(min, max)"
            );

          if (maxInt == null || maxInt instanceof IntValue === false)
            return this.Error(
              "Invalid value for maximum parameter of RANDOM(min, max)"
            );

          // Originally a primitive type, but here, can be null.
          // TODO: Replace by default value?
          if (maxInt.value === null) {
            return throwNullException("maxInt.value");
          }
          if (minInt.value === null) {
            return throwNullException("minInt.value");
          }

          // This code is differs a bit from the reference implementation, since
          // JavaScript has no true integers. Hence integer arithmetics and
          // interger overflows don't apply here. A loss of precision can
          // happen with big numbers however.
          //
          // The case where 'randomRange' is lower than zero is handled below,
          // so there's no need to test against Number.MIN_SAFE_INTEGER.
          let randomRange = maxInt.value - minInt.value + 1;
          if (!isFinite(randomRange) || randomRange > Number.MAX_SAFE_INTEGER) {
            randomRange = Number.MAX_SAFE_INTEGER;
            this.Error(
              "RANDOM was called with a range that exceeds the size that ink numbers can use."
            );
          }
          if (randomRange <= 0)
            this.Error(
              "RANDOM was called with minimum as " +
                minInt.value +
                " and maximum as " +
                maxInt.value +
                ". The maximum must be larger"
            );

          let resultSeed = this.state.storySeed + this.state.previousRandom;
          let random = new PRNG(resultSeed);

          let nextRandom = random.next();
          let chosenValue = (nextRandom % randomRange) + minInt.value;
          this.state.PushEvaluationStack(new IntValue(chosenValue));

          // Next random number (rather than keeping the Random object around)
          this.state.previousRandom = nextRandom;
          break;
        }

        case ControlCommand.CommandType.SeedRandom:
          let seed = asOrNull(this.state.PopEvaluationStack(), IntValue);
          if (seed == null || seed instanceof IntValue === false)
            return this.Error("Invalid value passed to SEED_RANDOM");

          // Originally a primitive type, but here, can be null.
          // TODO: Replace by default value?
          if (seed.value === null) {
            return throwNullException("minInt.value");
          }

          this.state.storySeed = seed.value;
          this.state.previousRandom = 0;

          this.state.PushEvaluationStack(new Void());
          break;

        case ControlCommand.CommandType.VisitIndex:
          let count =
            this.state.VisitCountForContainer(
              this.state.currentPointer.container
            ) - 1; // index not count
          this.state.PushEvaluationStack(new IntValue(count));
          break;

        case ControlCommand.CommandType.SequenceShuffleIndex:
          let shuffleIndex = this.NextSequenceShuffleIndex();
          this.state.PushEvaluationStack(new IntValue(shuffleIndex));
          break;

        case ControlCommand.CommandType.StartThread:
          // Handled in main step function
          break;

        case ControlCommand.CommandType.Done:
          // We may exist in the context of the initial
          // act of creating the thread, or in the context of
          // evaluating the content.
          if (this.state.callStack.canPopThread) {
            this.state.callStack.PopThread();
          }

          // In normal flow - allow safe exit without warning
          else {
            this.state.didSafeExit = true;

            // Stop flow in current thread
            this.state.currentPointer = Pointer.Null;
          }

          break;

        // Force flow to end completely
        case ControlCommand.CommandType.End:
          this.state.ForceEnd();
          break;

        case ControlCommand.CommandType.ListFromInt:
          // var intVal = state.PopEvaluationStack () as IntValue;
          let intVal = asOrNull(this.state.PopEvaluationStack(), IntValue);
          // var listNameVal = state.PopEvaluationStack () as StringValue;
          let listNameVal = asOrThrows(
            this.state.PopEvaluationStack(),
            StringValue
          );

          if (intVal === null) {
            throw new StoryException(
              "Passed non-integer when creating a list element from a numerical value."
            );
          }

          let generatedListValue = null;

          if (this.listDefinitions === null) {
            return throwNullException("this.listDefinitions");
          }
          let foundListDef = this.listDefinitions.TryListGetDefinition(
            listNameVal.value,
            null
          );
          if (foundListDef.exists) {
            // Originally a primitive type, but here, can be null.
            // TODO: Replace by default value?
            if (intVal.value === null) {
              return throwNullException("minInt.value");
            }

            let foundItem = foundListDef.result!.TryGetItemWithValue(
              intVal.value,
              InkListItem.Null
            );
            if (foundItem.exists) {
              generatedListValue = new ListValue(
                foundItem.result!,
                intVal.value
              );
            }
          } else {
            throw new StoryException(
              "Failed to find LIST called " + listNameVal.value
            );
          }

          if (generatedListValue == null) generatedListValue = new ListValue();

          this.state.PushEvaluationStack(generatedListValue);
          break;

        case ControlCommand.CommandType.ListRange:
          let max = asOrNull(this.state.PopEvaluationStack(), Value);
          let min = asOrNull(this.state.PopEvaluationStack(), Value);

          // var targetList = state.PopEvaluationStack () as ListValue;
          let targetList = asOrNull(this.state.PopEvaluationStack(), ListValue);

          if (targetList === null || min === null || max === null)
            throw new StoryException(
              "Expected list, minimum and maximum for LIST_RANGE"
            );

          if (targetList.value === null) {
            return throwNullException("targetList.value");
          }
          let result = targetList.value.ListWithSubRange(
            min.valueObject,
            max.valueObject
          );

          this.state.PushEvaluationStack(new ListValue(result));
          break;

        case ControlCommand.CommandType.ListRandom: {
          let listVal = this.state.PopEvaluationStack() as ListValue;
          if (listVal === null)
            throw new StoryException("Expected list for LIST_RANDOM");

          let list = listVal.value;

          let newList: InkList | null = null;

          if (list === null) {
            throw throwNullException("list");
          }
          if (list.Count == 0) {
            newList = new InkList();
          } else {
            // Generate a random index for the element to take
            let resultSeed = this.state.storySeed + this.state.previousRandom;
            let random = new PRNG(resultSeed);

            let nextRandom = random.next();
            let listItemIndex = nextRandom % list.Count;

            // This bit is a little different from the original
            // C# code, since iterators do not work in the same way.
            // First, we iterate listItemIndex - 1 times, calling next().
            // The listItemIndex-th time is made outside of the loop,
            // in order to retrieve the value.
            let listEnumerator = list.entries();
            for (let i = 0; i <= listItemIndex - 1; i++) {
              listEnumerator.next();
            }
            let value = listEnumerator.next().value ?? "SHOULDNOTOCCUR1";
            let randomItem: KeyValuePair<InkListItem, number> = {
              Key: InkListItem.fromSerializedKey(value[0]),
              Value: value[1] ?? 0,
            };

            // Origin list is simply the origin of the one element
            if (randomItem.Key.originName === null) {
              return throwNullException("randomItem.Key.originName");
            }
            newList = new InkList(randomItem.Key.originName, this);
            newList.Add(randomItem.Key, randomItem.Value);

            this.state.previousRandom = nextRandom;
          }

          this.state.PushEvaluationStack(new ListValue(newList));
          break;
        }

        default:
          this.Error("unhandled ControlCommand: " + evalCommand);
          break;
      }

      return true;
    }

    // Variable assignment
    else if (contentObj instanceof VariableAssignment) {
      let varAss = contentObj;
      let assignedVal = this.state.PopEvaluationStack();

      this.state.variablesState.Assign(varAss, assignedVal);

      return true;
    }

    // Variable reference
    else if (contentObj instanceof VariableReference) {
      let varRef = contentObj;
      let foundValue = null;

      // Explicit read count value
      if (varRef.pathForCount != null) {
        let container = varRef.containerForCount;
        let count = this.state.VisitCountForContainer(container);
        foundValue = new IntValue(count);
      }

      // Normal variable reference
      else {
        foundValue = this.state.variablesState.GetVariableWithName(varRef.name);

        if (foundValue == null) {
          this.Warning(
            "Variable not found: '" +
              varRef.name +
              "'. Using default value of 0 (false). This can happen with temporary variables if the declaration hasn't yet been hit. Globals are always given a default value on load if a value doesn't exist in the save state."
          );
          foundValue = new IntValue(0);
        }
      }

      this.state.PushEvaluationStack(foundValue);

      return true;
    }

    // Native function call
    else if (contentObj instanceof NativeFunctionCall) {
      let func = contentObj;
      let funcParams = this.state.PopEvaluationStack(func.numberOfParameters);
      let result = func.Call(funcParams);
      this.state.PushEvaluationStack(result);
      return true;
    }

    // No control content, must be ordinary content
    return false;
  }

  public ChoosePathString(
    path: string,
    resetCallstack = true,
    args: any[] = []
  ) {
    this.IfAsyncWeCant("call ChoosePathString right now");
    if (this.onChoosePathString !== null) this.onChoosePathString(path, args);

    if (resetCallstack) {
      this.ResetCallstack();
    } else {
      if (this.state.callStack.currentElement.type == PushPopType.Function) {
        let funcDetail = "";
        let container =
          this.state.callStack.currentElement.currentPointer.container;
        if (container != null) {
          funcDetail = "(" + container.path.toString() + ") ";
        }
        throw new Error(
          "Story was running a function " +
            funcDetail +
            "when you called ChoosePathString(" +
            path +
            ") - this is almost certainly not not what you want! Full stack trace: \n" +
            this.state.callStack.callStackTrace
        );
      }
    }

    this.state.PassArgumentsToEvaluationStack(args);
    this.ChoosePath(new Path(path));
  }

  public IfAsyncWeCant(activityStr: string) {
    if (this._asyncContinueActive)
      throw new Error(
        "Can't " +
          activityStr +
          ". Story is in the middle of a ContinueAsync(). Make more ContinueAsync() calls or a single Continue() call beforehand."
      );
  }

  public ChoosePath(p: Path, incrementingTurnIndex: boolean = true) {
    this.state.SetChosenPath(p, incrementingTurnIndex);

    // Take a note of newly visited containers for read counts etc
    this.VisitChangedContainersDueToDivert();
  }

  public ChooseChoiceIndex(choiceIdx: number) {
    choiceIdx = choiceIdx;
    let choices = this.currentChoices;
    this.Assert(
      choiceIdx >= 0 && choiceIdx < choices.length,
      "choice out of range"
    );

    let choiceToChoose = choices[choiceIdx];
    if (this.onMakeChoice !== null) this.onMakeChoice(choiceToChoose);

    if (choiceToChoose.threadAtGeneration === null) {
      return throwNullException("choiceToChoose.threadAtGeneration");
    }
    if (choiceToChoose.targetPath === null) {
      return throwNullException("choiceToChoose.targetPath");
    }

    this.state.callStack.currentThread = choiceToChoose.threadAtGeneration;

    this.ChoosePath(choiceToChoose.targetPath);
  }

  public HasFunction(functionName: string) {
    try {
      return this.KnotContainerWithName(functionName) != null;
    } catch (e) {
      return false;
    }
  }

  public EvaluateFunction(
    functionName: string,
    args: any[] = [],
    returnTextOutput: boolean = false
  ): Story.EvaluateFunctionTextOutput | any {
    // EvaluateFunction behaves slightly differently than the C# version.
    // In C#, you can pass a (second) parameter `out textOutput` to get the
    // text outputted by the function. This is not possible in js. Instead,
    // we maintain the regular signature (functionName, args), plus an
    // optional third parameter returnTextOutput. If set to true, we will
    // return both the textOutput and the returned value, as an object.

    if (this.onEvaluateFunction !== null)
      this.onEvaluateFunction(functionName, args);

    this.IfAsyncWeCant("evaluate a function");

    if (functionName == null) {
      throw new Error("Function is null");
    } else if (functionName == "" || functionName.trim() == "") {
      throw new Error("Function is empty or white space.");
    }

    let funcContainer = this.KnotContainerWithName(functionName);
    if (funcContainer == null) {
      throw new Error("Function doesn't exist: '" + functionName + "'");
    }

    let outputStreamBefore: InkObject[] = [];
    outputStreamBefore.push(...this.state.outputStream);
    this._state.ResetOutput();

    this.state.StartFunctionEvaluationFromGame(funcContainer, args);

    // Evaluate the function, and collect the string output
    let stringOutput = new StringBuilder();
    while (this.canContinue) {
      stringOutput.Append(this.Continue());
    }
    let textOutput = stringOutput.toString();

    this._state.ResetOutput(outputStreamBefore);

    let result = this.state.CompleteFunctionEvaluationFromGame();
    if (this.onCompleteEvaluateFunction != null)
      this.onCompleteEvaluateFunction(functionName, args, textOutput, result);

    return returnTextOutput ? { returned: result, output: textOutput } : result;
  }

  public EvaluateExpression(exprContainer: Container) {
    let startCallStackHeight = this.state.callStack.elements.length;

    this.state.callStack.Push(PushPopType.Tunnel);

    this._temporaryEvaluationContainer = exprContainer;

    this.state.GoToStart();

    let evalStackHeight = this.state.evaluationStack.length;

    this.Continue();

    this._temporaryEvaluationContainer = null;

    // Should have fallen off the end of the Container, which should
    // have auto-popped, but just in case we didn't for some reason,
    // manually pop to restore the state (including currentPath).
    if (this.state.callStack.elements.length > startCallStackHeight) {
      this.state.PopCallStack();
    }

    let endStackHeight = this.state.evaluationStack.length;
    if (endStackHeight > evalStackHeight) {
      return this.state.PopEvaluationStack();
    } else {
      return null;
    }
  }

  public allowExternalFunctionFallbacks: boolean = false;

  public CallExternalFunction(
    funcName: string | null,
    numberOfArguments: number
  ) {
    if (funcName === null) {
      return throwNullException("funcName");
    }
    let funcDef = this._externals.get(funcName);
    let fallbackFunctionContainer = null;

    let foundExternal = typeof funcDef !== "undefined";

    if (
      foundExternal &&
      !funcDef!.lookAheadSafe &&
      this._state.inStringEvaluation
    ) {
      this.Error(
        "External function " +
          funcName +
          ' could not be called because 1) it wasn\'t marked as lookaheadSafe when BindExternalFunction was called and 2) the story is in the middle of string generation, either because choice text is being generated, or because you have ink like "hello {func()}". You can work around this by generating the result of your function into a temporary variable before the string or choice gets generated: ~ temp x = ' +
          funcName +
          "()"
      );
    }

    if (
      foundExternal &&
      !funcDef!.lookAheadSafe &&
      this._stateSnapshotAtLastNewline !== null
    ) {
      this._sawLookaheadUnsafeFunctionAfterNewline = true;
      return;
    }

    if (!foundExternal) {
      if (this.allowExternalFunctionFallbacks) {
        fallbackFunctionContainer = this.KnotContainerWithName(funcName);
        this.Assert(
          fallbackFunctionContainer !== null,
          "Trying to call EXTERNAL function '" +
            funcName +
            "' which has not been bound, and fallback ink function could not be found."
        );

        // Divert direct into fallback function and we're done
        this.state.callStack.Push(
          PushPopType.Function,
          undefined,
          this.state.outputStream.length
        );
        this.state.divertedPointer = Pointer.StartOf(fallbackFunctionContainer);
        return;
      } else {
        this.Assert(
          false,
          "Trying to call EXTERNAL function '" +
            funcName +
            "' which has not been bound (and ink fallbacks disabled)."
        );
      }
    }

    // Pop arguments
    let args: any[] = [];
    for (let i = 0; i < numberOfArguments; ++i) {
      // var poppedObj = state.PopEvaluationStack () as Value;
      let poppedObj = asOrThrows(this.state.PopEvaluationStack(), Value);
      let valueObj = poppedObj.valueObject;
      args.push(valueObj);
    }

    // Reverse arguments from the order they were popped,
    // so they're the right way round again.
    args.reverse();

    // Run the function!
    let funcResult = funcDef!.function(args);

    // Convert return value (if any) to the a type that the ink engine can use
    let returnObj = null;
    if (funcResult != null) {
      returnObj = Value.Create(funcResult);
      this.Assert(
        returnObj !== null,
        "Could not create ink value from returned object of type " +
          typeof funcResult
      );
    } else {
      returnObj = new Void();
    }

    this.state.PushEvaluationStack(returnObj);
  }

  public BindExternalFunctionGeneral(
    funcName: string,
    func: Story.ExternalFunction,
    lookaheadSafe: boolean = true
  ) {
    this.IfAsyncWeCant("bind an external function");
    this.Assert(
      !this._externals.has(funcName),
      "Function '" + funcName + "' has already been bound."
    );
    this._externals.set(funcName, {
      function: func,
      lookAheadSafe: lookaheadSafe,
    });
  }

  public TryCoerce(value: any) {
    // We're skipping type coercition in this implementation. First of, js
    // is loosely typed, so it's not that important. Secondly, there is no
    // clean way (AFAIK) for the user to describe what type of parameters
    // they expect.
    return value;
  }

  public BindExternalFunction(
    funcName: string,
    func: Story.ExternalFunction,
    lookaheadSafe: boolean = false
  ) {
    this.Assert(func != null, "Can't bind a null function");

    this.BindExternalFunctionGeneral(
      funcName,
      (args: any) => {
        this.Assert(
          args.length >= func.length,
          "External function expected " + func.length + " arguments"
        );

        let coercedArgs = [];
        for (let i = 0, l = args.length; i < l; i++) {
          coercedArgs[i] = this.TryCoerce(args[i]);
        }
        return func.apply(null, coercedArgs);
      },
      lookaheadSafe
    );
  }

  public UnbindExternalFunction(funcName: string) {
    this.IfAsyncWeCant("unbind an external a function");
    this.Assert(
      this._externals.has(funcName),
      "Function '" + funcName + "' has not been bound."
    );
    this._externals.delete(funcName);
  }

  public ValidateExternalBindings(): void;
  public ValidateExternalBindings(
    c: Container | null,
    missingExternals: Set<string>
  ): void;
  public ValidateExternalBindings(
    o: InkObject | null,
    missingExternals: Set<string>
  ): void;
  public ValidateExternalBindings() {
    let c: Container | null = null;
    let o: InkObject | null = null;
    let missingExternals: Set<string> = arguments[1] || new Set();

    if (arguments[0] instanceof Container) {
      c = arguments[0];
    }

    if (arguments[0] instanceof InkObject) {
      o = arguments[0];
    }

    if (c === null && o === null) {
      this.ValidateExternalBindings(
        this._mainContentContainer,
        missingExternals
      );
      this._hasValidatedExternals = true;

      // No problem! Validation complete
      if (missingExternals.size == 0) {
        this._hasValidatedExternals = true;
      } else {
        let message = "Error: Missing function binding for external";
        message += missingExternals.size > 1 ? "s" : "";
        message += ": '";
        message += Array.from(missingExternals).join("', '");
        message += "' ";
        message += this.allowExternalFunctionFallbacks
          ? ", and no fallback ink function found."
          : " (ink fallbacks disabled)";

        this.Error(message);
      }
    } else if (c != null) {
      for (let innerContent of c.content) {
        let container = innerContent as Container;
        if (container == null || !container.hasValidName)
          this.ValidateExternalBindings(innerContent, missingExternals);
      }
      for (let [, value] of c.namedContent) {
        this.ValidateExternalBindings(
          asOrNull(value, InkObject),
          missingExternals
        );
      }
    } else if (o != null) {
      let divert = asOrNull(o, Divert);
      if (divert && divert.isExternal) {
        let name = divert.targetPathString;
        if (name === null) {
          return throwNullException("name");
        }
        if (!this._externals.has(name)) {
          if (this.allowExternalFunctionFallbacks) {
            let fallbackFound =
              this.mainContentContainer.namedContent.has(name);
            if (!fallbackFound) {
              missingExternals.add(name);
            }
          } else {
            missingExternals.add(name);
          }
        }
      }
    }
  }

  public ObserveVariable(
    variableName: string,
    observer: Story.VariableObserver
  ) {
    this.IfAsyncWeCant("observe a new variable");

    if (this._variableObservers === null) this._variableObservers = new Map();

    if (!this.state.variablesState.GlobalVariableExistsWithName(variableName))
      throw new Error(
        "Cannot observe variable '" +
          variableName +
          "' because it wasn't declared in the ink story."
      );

    if (this._variableObservers.has(variableName)) {
      this._variableObservers.get(variableName)!.push(observer);
    } else {
      this._variableObservers.set(variableName, [observer]);
    }
  }

  public ObserveVariables(
    variableNames: string[],
    observers: Story.VariableObserver[]
  ) {
    for (let i = 0, l = variableNames.length; i < l; i++) {
      this.ObserveVariable(variableNames[i], observers[i]);
    }
  }

  public RemoveVariableObserver(
    observer?: Story.VariableObserver,
    specificVariableName?: string
  ) {
    // A couple of things to know about this method:
    //
    // 1. Since `RemoveVariableObserver` is exposed to the JavaScript world,
    //    optionality is marked as `undefined` rather than `null`.
    //    To keep things simple, null-checks are performed using regular
    //    equality operators, where undefined == null.
    //
    // 2. Since C# delegates are translated to arrays of functions,
    //    -= becomes a call to splice and null-checks are replaced by
    //    emptiness-checks.
    //
    this.IfAsyncWeCant("remove a variable observer");

    if (this._variableObservers === null) return;

    if (specificVariableName != null) {
      if (this._variableObservers.has(specificVariableName)) {
        if (observer != null) {
          let variableObservers =
            this._variableObservers.get(specificVariableName);
          if (variableObservers != null) {
            variableObservers.splice(variableObservers.indexOf(observer), 1);
            if (variableObservers.length === 0) {
              this._variableObservers.delete(specificVariableName);
            }
          }
        } else {
          this._variableObservers.delete(specificVariableName);
        }
      }
    } else if (observer != null) {
      let keys = this._variableObservers.keys();
      for (let varName of keys) {
        let variableObservers = this._variableObservers.get(varName);
        if (variableObservers != null) {
          variableObservers.splice(variableObservers.indexOf(observer), 1);
          if (variableObservers.length === 0) {
            this._variableObservers.delete(varName);
          }
        }
      }
    }
  }

  public VariableStateDidChangeEvent(
    variableName: string,
    newValueObj: InkObject
  ) {
    if (this._variableObservers === null) return;

    let observers = this._variableObservers.get(variableName);
    if (typeof observers !== "undefined") {
      if (!(newValueObj instanceof Value)) {
        throw new Error(
          "Tried to get the value of a variable that isn't a standard type"
        );
      }
      // var val = newValueObj as Value;
      let val = asOrThrows(newValueObj, Value);

      for (let observer of observers) {
        observer(variableName, val.valueObject);
      }
    }
  }

  get globalTags() {
    return this.TagsAtStartOfFlowContainerWithPathString("");
  }

  public TagsForContentAtPath(path: string) {
    return this.TagsAtStartOfFlowContainerWithPathString(path);
  }

  public TagsAtStartOfFlowContainerWithPathString(pathString: string) {
    let path = new Path(pathString);

    let flowContainer = this.ContentAtPath(path).container;
    if (flowContainer === null) {
      return throwNullException("flowContainer");
    }
    while (true) {
      let firstContent: InkObject = flowContainer.content[0];
      if (firstContent instanceof Container) flowContainer = firstContent;
      else break;
    }

    let inTag = false;
    let tags: string[] | null = null;

    for (let c of flowContainer.content) {
      // var tag = c as Runtime.Tag;
      let command = asOrNull(c, ControlCommand);

      if (command != null) {
        if (command.commandType == ControlCommand.CommandType.BeginTag) {
          inTag = true;
        } else if (command.commandType == ControlCommand.CommandType.EndTag) {
          inTag = false;
        }
      } else if (inTag) {
        let str = asOrNull(c, StringValue);
        if (str !== null) {
          if (tags === null) tags = [];
          if (str.value !== null) tags.push(str.value);
        } else {
          this.Error(
            "Tag contained non-text content. Only plain text is allowed when using globalTags or TagsAtContentPath. If you want to evaluate dynamic content, you need to use story.Continue()."
          );
        }
      } else {
        break;
      }
    }

    return tags;
  }

  public BuildStringOfHierarchy() {
    let sb = new StringBuilder();

    this.mainContentContainer.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve()
    );

    return sb.toString();
  }

  public BuildStringOfContainer(container: Container) {
    let sb = new StringBuilder();
    container.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve()
    );
    return sb.toString();
  }

  public NextContent() {
    this.state.previousPointer = this.state.currentPointer.copy();

    if (!this.state.divertedPointer.isNull) {
      this.state.currentPointer = this.state.divertedPointer.copy();
      this.state.divertedPointer = Pointer.Null;

      this.VisitChangedContainersDueToDivert();

      if (!this.state.currentPointer.isNull) {
        return;
      }
    }

    let successfulPointerIncrement = this.IncrementContentPointer();

    if (!successfulPointerIncrement) {
      let didPop = false;

      if (this.state.callStack.CanPop(PushPopType.Function)) {
        this.state.PopCallStack(PushPopType.Function);

        if (this.state.inExpressionEvaluation) {
          this.state.PushEvaluationStack(new Void());
        }

        didPop = true;
      } else if (this.state.callStack.canPopThread) {
        this.state.callStack.PopThread();

        didPop = true;
      } else {
        this.state.TryExitFunctionEvaluationFromGame();
      }

      if (didPop && !this.state.currentPointer.isNull) {
        this.NextContent();
      }
    }
  }

  public IncrementContentPointer() {
    let successfulIncrement = true;

    let pointer = this.state.callStack.currentElement.currentPointer.copy();
    pointer.index++;

    if (pointer.container === null) {
      return throwNullException("pointer.container");
    }
    while (pointer.index >= pointer.container.content.length) {
      successfulIncrement = false;

      // Container nextAncestor = pointer.container.parent as Container;
      let nextAncestor = asOrNull(pointer.container.parent, Container);
      if (nextAncestor instanceof Container === false) {
        break;
      }

      let indexInAncestor = nextAncestor!.content.indexOf(pointer.container);
      if (indexInAncestor == -1) {
        break;
      }

      pointer = new Pointer(nextAncestor, indexInAncestor);

      pointer.index++;

      successfulIncrement = true;
      if (pointer.container === null) {
        return throwNullException("pointer.container");
      }
    }

    if (!successfulIncrement) pointer = Pointer.Null;

    this.state.callStack.currentElement.currentPointer = pointer.copy();

    return successfulIncrement;
  }

  public TryFollowDefaultInvisibleChoice() {
    let allChoices = this._state.currentChoices;

    let invisibleChoices = allChoices.filter((c) => c.isInvisibleDefault);

    if (
      invisibleChoices.length == 0 ||
      allChoices.length > invisibleChoices.length
    )
      return false;

    let choice = invisibleChoices[0];

    if (choice.targetPath === null) {
      return throwNullException("choice.targetPath");
    }

    if (choice.threadAtGeneration === null) {
      return throwNullException("choice.threadAtGeneration");
    }

    this.state.callStack.currentThread = choice.threadAtGeneration;

    if (this._stateSnapshotAtLastNewline !== null) {
      this.state.callStack.currentThread = this.state.callStack.ForkThread();
    }

    this.ChoosePath(choice.targetPath, false);

    return true;
  }

  public NextSequenceShuffleIndex() {
    // var numElementsIntVal = state.PopEvaluationStack () as IntValue;
    let numElementsIntVal = asOrNull(this.state.PopEvaluationStack(), IntValue);
    if (!(numElementsIntVal instanceof IntValue)) {
      this.Error("expected number of elements in sequence for shuffle index");
      return 0;
    }

    let seqContainer = this.state.currentPointer.container;
    if (seqContainer === null) {
      return throwNullException("seqContainer");
    }

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (numElementsIntVal.value === null) {
      return throwNullException("numElementsIntVal.value");
    }
    let numElements = numElementsIntVal.value;

    // var seqCountVal = state.PopEvaluationStack () as IntValue;
    let seqCountVal = asOrThrows(this.state.PopEvaluationStack(), IntValue);
    let seqCount = seqCountVal.value;

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (seqCount === null) {
      return throwNullException("seqCount");
    }

    let loopIndex = seqCount / numElements;
    let iterationIndex = seqCount % numElements;

    let seqPathStr = seqContainer.path.toString();
    let sequenceHash = 0;
    for (let i = 0, l = seqPathStr.length; i < l; i++) {
      sequenceHash += seqPathStr.charCodeAt(i) || 0;
    }
    let randomSeed = sequenceHash + loopIndex + this.state.storySeed;
    let random = new PRNG(Math.floor(randomSeed));

    let unpickedIndices = [];
    for (let i = 0; i < numElements; ++i) {
      unpickedIndices.push(i);
    }

    for (let i = 0; i <= iterationIndex; ++i) {
      let chosen = random.next() % unpickedIndices.length;
      let chosenIndex = unpickedIndices[chosen];
      unpickedIndices.splice(chosen, 1);

      if (i == iterationIndex) {
        return chosenIndex;
      }
    }

    throw new Error("Should never reach here");
  }

  public Error(message: string, useEndLineNumber = false): never {
    let e = new StoryException(message);
    e.useEndLineNumber = useEndLineNumber;
    throw e;
  }

  public Warning(message: string) {
    this.AddError(message, true);
  }

  public AddError(
    message: string,
    isWarning = false,
    useEndLineNumber = false
  ) {
    let dm = this.currentDebugMetadata;

    let errorTypeStr = isWarning ? "WARNING" : "ERROR";

    if (dm != null) {
      let lineNum = useEndLineNumber ? dm.endLineNumber : dm.startLineNumber;
      message =
        "RUNTIME " +
        errorTypeStr +
        ": '" +
        dm.fileName +
        "' line " +
        lineNum +
        ": " +
        message;
    } else if (!this.state.currentPointer.isNull) {
      message =
        "RUNTIME " +
        errorTypeStr +
        ": (" +
        this.state.currentPointer +
        "): " +
        message;
    } else {
      message = "RUNTIME " + errorTypeStr + ": " + message;
    }

    this.state.AddError(message, isWarning);

    // In a broken state don't need to know about any other errors.
    if (!isWarning) this.state.ForceEnd();
  }

  public Assert(condition: boolean, message: string | null = null) {
    if (condition == false) {
      if (message == null) {
        message = "Story assert";
      }

      throw new Error(message + " " + this.currentDebugMetadata);
    }
  }

  get currentDebugMetadata(): DebugMetadata | null {
    let dm: DebugMetadata | null;

    let pointer = this.state.currentPointer;
    if (!pointer.isNull && pointer.Resolve() !== null) {
      dm = pointer.Resolve()!.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    for (let i = this.state.callStack.elements.length - 1; i >= 0; --i) {
      pointer = this.state.callStack.elements[i].currentPointer;
      if (!pointer.isNull && pointer.Resolve() !== null) {
        dm = pointer.Resolve()!.debugMetadata;
        if (dm !== null) {
          return dm;
        }
      }
    }

    for (let i = this.state.outputStream.length - 1; i >= 0; --i) {
      let outputObj = this.state.outputStream[i];
      dm = outputObj.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    return null;
  }

  get mainContentContainer() {
    if (this._temporaryEvaluationContainer) {
      return this._temporaryEvaluationContainer;
    } else {
      return this._mainContentContainer;
    }
  }

  /**
   * `_mainContentContainer` is almost guaranteed to be set in the
   * constructor, unless the json is malformed.
   */
  private _mainContentContainer!: Container;
  private _listDefinitions: ListDefinitionsOrigin | null = null;

  private _externals: Map<string, Story.ExternalFunctionDef>;
  private _variableObservers: Map<string, Story.VariableObserver[]> | null =
    null;
  private _hasValidatedExternals: boolean = false;

  private _temporaryEvaluationContainer: Container | null = null;

  /**
   * `state` is almost guaranteed to be set in the constructor, unless
   * using the compiler-specific constructor which will likely not be used in
   * the real world.
   */
  private _state!: StoryState;

  private _asyncContinueActive: boolean = false;
  private _stateSnapshotAtLastNewline: StoryState | null = null;
  private _sawLookaheadUnsafeFunctionAfterNewline: boolean = false;

  private _recursiveContinueCount: number = 0;

  private _asyncSaving: boolean = false;

  private _profiler: any | null = null; // TODO: Profiler
}

export namespace Story {
  export enum OutputStateChange {
    NoChange = 0,
    ExtendedBeyondNewline = 1,
    NewlineRemoved = 2,
  }

  export interface EvaluateFunctionTextOutput {
    returned: any;
    output: string;
  }

  export interface ExternalFunctionDef {
    function: ExternalFunction;
    lookAheadSafe: boolean;
  }

  export type VariableObserver = (variableName: string, newValue: any) => void;
  export type ExternalFunction = (...args: any) => any;
}

import { VariablesState } from "./VariablesState";
import { ValueType } from "./Object";
import { Glue } from "./Glue";
import { tryGetValueFromMap } from "./TryGetResult";
import { nullIfUndefined } from "./TypeAssertion";
import { Debug } from "./Debug";
import { StatePatch } from "./StatePatch";
import { Flow } from "./Flow";

export class StoryState {
  // Backward compatible changes since v8:
  // v10: dynamic tags
  // v9:  multi-flows
  public readonly kInkSaveStateVersion = 10;
  public readonly kMinCompatibleLoadVersion = 8;

  public onDidLoadState: (() => void) | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public ToJson(indented: boolean = false) {
    let writer = new SimpleJson.Writer();
    this.WriteJson(writer);
    return writer.toString();
  }
  public toJson(indented: boolean = false) {
    return this.ToJson(indented);
  }

  public LoadJson(json: string) {
    let jObject = SimpleJson.TextToDictionary(json);
    this.LoadJsonObj(jObject);
    if (this.onDidLoadState !== null) this.onDidLoadState();
  }

  public VisitCountAtPathString(pathString: string) {
    let visitCountOut;

    if (this._patch !== null) {
      let container = this.story.ContentAtPath(new Path(pathString)).container;
      if (container === null)
        throw new Error("Content at path not found: " + pathString);

      visitCountOut = this._patch.TryGetVisitCount(container, 0);
      if (visitCountOut.exists) return visitCountOut.result;
    }

    visitCountOut = tryGetValueFromMap(this._visitCounts, pathString, null);
    if (visitCountOut.exists) return visitCountOut.result;

    return 0;
  }

  public VisitCountForContainer(container: Container | null): number {
    if (container === null) {
      return throwNullException("container");
    }
    if (!container.visitsShouldBeCounted) {
      this.story.Error(
        "Read count for target (" +
          container.name +
          " - on " +
          container.debugMetadata +
          ") unknown. The story may need to be compiled with countAllVisits flag (-c)."
      );
      return 0;
    }

    if (this._patch !== null) {
      let count = this._patch.TryGetVisitCount(container, 0);
      if (count.exists) {
        return count.result!;
      }
    }

    let containerPathStr = container.path.toString();
    let count2 = tryGetValueFromMap(this._visitCounts, containerPathStr, null);
    if (count2.exists) {
      return count2.result!;
    }

    return 0;
  }

  public IncrementVisitCountForContainer(container: Container) {
    if (this._patch !== null) {
      let currCount = this.VisitCountForContainer(container);
      currCount++;
      this._patch.SetVisitCount(container, currCount);
      return;
    }

    let containerPathStr = container.path.toString();
    let count = tryGetValueFromMap(this._visitCounts, containerPathStr, null);
    if (count.exists) {
      this._visitCounts.set(containerPathStr, count.result! + 1);
    } else {
      this._visitCounts.set(containerPathStr, 1);
    }
  }

  public RecordTurnIndexVisitToContainer(container: Container) {
    if (this._patch !== null) {
      this._patch.SetTurnIndex(container, this.currentTurnIndex);
      return;
    }

    let containerPathStr = container.path.toString();
    this._turnIndices.set(containerPathStr, this.currentTurnIndex);
  }

  public TurnsSinceForContainer(container: Container) {
    if (!container.turnIndexShouldBeCounted) {
      this.story.Error(
        "TURNS_SINCE() for target (" +
          container.name +
          " - on " +
          container.debugMetadata +
          ") unknown. The story may need to be compiled with countAllVisits flag (-c)."
      );
    }

    if (this._patch !== null) {
      let index = this._patch.TryGetTurnIndex(container, 0);
      if (index.exists) {
        return this.currentTurnIndex - index.result!;
      }
    }

    let containerPathStr = container.path.toString();
    let index2 = tryGetValueFromMap(this._turnIndices, containerPathStr, 0);
    if (index2.exists) {
      return this.currentTurnIndex - index2.result!;
    } else {
      return -1;
    }
  }

  get callstackDepth() {
    return this.callStack.depth;
  }

  get outputStream() {
    return this._currentFlow.outputStream;
  }

  get currentChoices() {
    // If we can continue generating text content rather than choices,
    // then we reflect the choice list as being empty, since choices
    // should always come at the end.
    if (this.canContinue) return [];
    return this._currentFlow.currentChoices;
  }

  get generatedChoices() {
    return this._currentFlow.currentChoices;
  }

  get currentErrors() {
    return this._currentErrors;
  }
  private _currentErrors: string[] | null = null;

  get currentWarnings() {
    return this._currentWarnings;
  }
  private _currentWarnings: string[] | null = null;

  get variablesState() {
    return this._variablesState;
  }
  set variablesState(value) {
    this._variablesState = value;
  }
  private _variablesState: VariablesState;

  get callStack() {
    return this._currentFlow.callStack;
  }

  get evaluationStack() {
    return this._evaluationStack;
  }
  private _evaluationStack: InkObject[];

  public divertedPointer: Pointer = Pointer.Null;

  get currentTurnIndex() {
    return this._currentTurnIndex;
  }
  set currentTurnIndex(value) {
    this._currentTurnIndex = value;
  }
  private _currentTurnIndex: number = 0;

  public storySeed: number = 0;
  public previousRandom: number = 0;
  public didSafeExit: boolean = false;

  public story: Story;

  get currentPathString() {
    let pointer = this.currentPointer;
    if (pointer.isNull) {
      return null;
    } else {
      if (pointer.path === null) {
        return throwNullException("pointer.path");
      }
      return pointer.path.toString();
    }
  }

  get previousPathString() {
    let pointer = this.previousPointer;
    if (pointer.isNull) {
      return null;
    } else {
      if (pointer.path === null) {
        return throwNullException("previousPointer.path");
      }
      return pointer.path.toString();
    }
  }

  get currentPointer() {
    return this.callStack.currentElement.currentPointer.copy();
  }

  set currentPointer(value) {
    this.callStack.currentElement.currentPointer = value.copy();
  }

  get previousPointer() {
    return this.callStack.currentThread.previousPointer.copy();
  }

  set previousPointer(value) {
    this.callStack.currentThread.previousPointer = value.copy();
  }

  get canContinue() {
    return !this.currentPointer.isNull && !this.hasError;
  }

  get hasError() {
    return this.currentErrors != null && this.currentErrors.length > 0;
  }

  get hasWarning() {
    return this.currentWarnings != null && this.currentWarnings.length > 0;
  }

  get currentText() {
    if (this._outputStreamTextDirty) {
      let sb = new StringBuilder();

      let inTag: boolean = false;

      for (let outputObj of this.outputStream) {
        // var textContent = outputObj as StringValue;
        let textContent = asOrNull(outputObj, StringValue);
        if (!inTag && textContent !== null) {
          sb.Append(textContent.value);
        } else {
          let controlCommand = asOrNull(outputObj, ControlCommand);
          if (controlCommand !== null) {
            if (
              controlCommand.commandType == ControlCommand.CommandType.BeginTag
            ) {
              inTag = true;
            } else if (
              controlCommand.commandType == ControlCommand.CommandType.EndTag
            ) {
              inTag = false;
            }
          }
        }
      }

      this._currentText = this.CleanOutputWhitespace(sb.toString());
      this._outputStreamTextDirty = false;
    }

    return this._currentText;
  }
  private _currentText: string | null = null;

  public CleanOutputWhitespace(str: string) {
    let sb = new StringBuilder();

    let currentWhitespaceStart = -1;
    let startOfLine = 0;

    for (let i = 0; i < str.length; i++) {
      let c = str.charAt(i);

      let isInlineWhitespace = c == " " || c == "\t";

      if (isInlineWhitespace && currentWhitespaceStart == -1)
        currentWhitespaceStart = i;

      if (!isInlineWhitespace) {
        if (
          c != "\n" &&
          currentWhitespaceStart > 0 &&
          currentWhitespaceStart != startOfLine
        ) {
          sb.Append(" ");
        }
        currentWhitespaceStart = -1;
      }

      if (c == "\n") startOfLine = i + 1;

      if (!isInlineWhitespace) sb.Append(c);
    }

    return sb.toString();
  }

  get currentTags() {
    if (this._outputStreamTagsDirty) {
      this._currentTags = [];
      let inTag: boolean = false;
      let sb = new StringBuilder();

      for (let outputObj of this.outputStream) {
        let controlCommand = asOrNull(outputObj, ControlCommand);
        if (controlCommand != null) {
          if (
            controlCommand.commandType == ControlCommand.CommandType.BeginTag
          ) {
            if (inTag && sb.Length > 0) {
              let txt = this.CleanOutputWhitespace(sb.toString());
              this._currentTags.push(txt);
              sb.Clear();
            }
            inTag = true;
          } else if (
            controlCommand.commandType == ControlCommand.CommandType.EndTag
          ) {
            if (sb.Length > 0) {
              let txt = this.CleanOutputWhitespace(sb.toString());
              this._currentTags.push(txt);
              sb.Clear();
            }
            inTag = false;
          }
        } else if (inTag) {
          let strVal = asOrNull(outputObj, StringValue);
          if (strVal !== null) {
            sb.Append(strVal.value);
          }
        } else {
          let tag = asOrNull(outputObj, Tag);
          if (tag != null && tag.text != null && tag.text.length > 0) {
            this._currentTags.push(tag.text); // tag.text has whitespae already cleaned
          }
        }
      }

      if (sb.Length > 0) {
        let txt = this.CleanOutputWhitespace(sb.toString());
        this._currentTags.push(txt);
        sb.Clear();
      }

      this._outputStreamTagsDirty = false;
    }

    return this._currentTags;
  }
  private _currentTags: string[] | null = null;

  get currentFlowName() {
    return this._currentFlow.name;
  }

  get currentFlowIsDefaultFlow() {
    return this._currentFlow.name == this.kDefaultFlowName;
  }

  get aliveFlowNames() {
    if (this._aliveFlowNamesDirty) {
      this._aliveFlowNames = [];

      if (this._namedFlows != null) {
        for (let flowName of this._namedFlows.keys()) {
          if (flowName != this.kDefaultFlowName) {
            this._aliveFlowNames.push(flowName);
          }
        }
      }

      this._aliveFlowNamesDirty = false;
    }

    return this._aliveFlowNames;
  }

  get inExpressionEvaluation() {
    return this.callStack.currentElement.inExpressionEvaluation;
  }
  set inExpressionEvaluation(value) {
    this.callStack.currentElement.inExpressionEvaluation = value;
  }

  constructor(story: Story) {
    this.story = story;

    this._currentFlow = new Flow(this.kDefaultFlowName, story);
    this.OutputStreamDirty();

    this._aliveFlowNamesDirty = true;
    this._evaluationStack = [];

    this._variablesState = new VariablesState(
      this.callStack,
      story.listDefinitions
    );

    this._visitCounts = new Map();
    this._turnIndices = new Map();
    this.currentTurnIndex = -1;

    let timeSeed = new Date().getTime();
    this.storySeed = new PRNG(timeSeed).next() % 100;
    this.previousRandom = 0;

    this.GoToStart();
  }

  public GoToStart() {
    this.callStack.currentElement.currentPointer = Pointer.StartOf(
      this.story.mainContentContainer
    );
  }

  public SwitchFlow_Internal(flowName: string | null) {
    if (flowName === null)
      throw new Error("Must pass a non-null string to Story.SwitchFlow");

    if (this._namedFlows === null) {
      this._namedFlows = new Map();
      this._namedFlows.set(this.kDefaultFlowName, this._currentFlow);
    }

    if (flowName === this._currentFlow.name) {
      return;
    }

    let flow: Flow;
    let content = tryGetValueFromMap(this._namedFlows, flowName, null);
    if (content.exists) {
      flow = content.result!;
    } else {
      flow = new Flow(flowName, this.story);
      this._namedFlows.set(flowName, flow);
      this._aliveFlowNamesDirty = true;
    }

    this._currentFlow = flow;
    this.variablesState.callStack = this._currentFlow.callStack;

    this.OutputStreamDirty();
  }

  public SwitchToDefaultFlow_Internal() {
    if (this._namedFlows === null) return;
    this.SwitchFlow_Internal(this.kDefaultFlowName);
  }

  public RemoveFlow_Internal(flowName: string | null) {
    if (flowName === null)
      throw new Error("Must pass a non-null string to Story.DestroyFlow");
    if (flowName === this.kDefaultFlowName)
      throw new Error("Cannot destroy default flow");

    if (this._currentFlow.name === flowName) {
      this.SwitchToDefaultFlow_Internal();
    }

    if (this._namedFlows === null)
      return throwNullException("this._namedFlows");
    this._namedFlows.delete(flowName);
    this._aliveFlowNamesDirty = true;
  }

  public CopyAndStartPatching(forBackgroundSave: boolean) {
    let copy = new StoryState(this.story);

    copy._patch = new StatePatch(this._patch);

    copy._currentFlow.name = this._currentFlow.name;
    copy._currentFlow.callStack = new CallStack(this._currentFlow.callStack);
    copy._currentFlow.outputStream.push(...this._currentFlow.outputStream);
    copy.OutputStreamDirty();

    // When background saving we need to make copies of choices since they each have
    // a snapshot of the thread at the time of generation since the game could progress
    // significantly and threads modified during the save process.
    // However, when doing internal saving and restoring of snapshots this isn't an issue,
    // and we can simply ref-copy the choices with their existing threads.

    if (forBackgroundSave) {
      for (let choice of this._currentFlow.currentChoices) {
        copy._currentFlow.currentChoices.push(choice.Clone());
      }
    } else {
      copy._currentFlow.currentChoices.push(
        ...this._currentFlow.currentChoices
      );
    }

    if (this._namedFlows !== null) {
      copy._namedFlows = new Map();
      for (let [namedFlowKey, namedFlowValue] of this._namedFlows) {
        copy._namedFlows.set(namedFlowKey, namedFlowValue);
        copy._aliveFlowNamesDirty = true;
      }
      copy._namedFlows.set(this._currentFlow.name, copy._currentFlow);
    }

    if (this.hasError) {
      copy._currentErrors = [];
      copy._currentErrors.push(...(this.currentErrors || []));
    }

    if (this.hasWarning) {
      copy._currentWarnings = [];
      copy._currentWarnings.push(...(this.currentWarnings || []));
    }

    copy.variablesState = this.variablesState;
    copy.variablesState.callStack = copy.callStack;
    copy.variablesState.patch = copy._patch;

    copy.evaluationStack.push(...this.evaluationStack);

    if (!this.divertedPointer.isNull)
      copy.divertedPointer = this.divertedPointer.copy();

    copy.previousPointer = this.previousPointer.copy();

    copy._visitCounts = this._visitCounts;
    copy._turnIndices = this._turnIndices;

    copy.currentTurnIndex = this.currentTurnIndex;
    copy.storySeed = this.storySeed;
    copy.previousRandom = this.previousRandom;

    copy.didSafeExit = this.didSafeExit;

    return copy;
  }

  public RestoreAfterPatch() {
    this.variablesState.callStack = this.callStack;
    this.variablesState.patch = this._patch;
  }

  public ApplyAnyPatch() {
    if (this._patch === null) return;

    this.variablesState.ApplyPatch();

    for (let [key, value] of this._patch.visitCounts)
      this.ApplyCountChanges(key, value, true);

    for (let [key, value] of this._patch.turnIndices)
      this.ApplyCountChanges(key, value, false);

    this._patch = null;
  }

  public ApplyCountChanges(
    container: Container,
    newCount: number,
    isVisit: boolean
  ) {
    let counts = isVisit ? this._visitCounts : this._turnIndices;
    counts.set(container.path.toString(), newCount);
  }

  public WriteJson(writer: SimpleJson.Writer) {
    writer.WriteObjectStart();

    writer.WritePropertyStart("flows");
    writer.WriteObjectStart();

    // NOTE: Never pass `WriteJson` directly as an argument to `WriteProperty`.
    // Call it inside a function to make sure `this` is correctly bound
    // and passed down the call hierarchy.

    if (this._namedFlows !== null) {
      for (let [namedFlowKey, namedFlowValue] of this._namedFlows) {
        writer.WriteProperty(namedFlowKey, (w) => namedFlowValue.WriteJson(w));
      }
    } else {
      writer.WriteProperty(this._currentFlow.name, (w) =>
        this._currentFlow.WriteJson(w)
      );
    }

    writer.WriteObjectEnd();
    writer.WritePropertyEnd();

    writer.WriteProperty("currentFlowName", this._currentFlow.name);

    writer.WriteProperty("variablesState", (w) =>
      this.variablesState.WriteJson(w)
    );

    writer.WriteProperty("evalStack", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.evaluationStack)
    );

    if (!this.divertedPointer.isNull) {
      if (this.divertedPointer.path === null) {
        return throwNullException("divertedPointer");
      }
      writer.WriteProperty(
        "currentDivertTarget",
        this.divertedPointer.path.componentsString
      );
    }

    writer.WriteProperty("visitCounts", (w) =>
      JsonSerialisation.WriteIntDictionary(w, this._visitCounts)
    );
    writer.WriteProperty("turnIndices", (w) =>
      JsonSerialisation.WriteIntDictionary(w, this._turnIndices)
    );

    writer.WriteIntProperty("turnIdx", this.currentTurnIndex);
    writer.WriteIntProperty("storySeed", this.storySeed);
    writer.WriteIntProperty("previousRandom", this.previousRandom);

    writer.WriteIntProperty("inkSaveVersion", this.kInkSaveStateVersion);

    writer.WriteIntProperty("inkFormatVersion", Story.inkVersionCurrent);

    writer.WriteObjectEnd();
  }

  public LoadJsonObj(value: Record<string, any>) {
    let jObject = value;

    let jSaveVersion = jObject["inkSaveVersion"];
    if (jSaveVersion == null) {
      throw new Error("ink save format incorrect, can't load.");
    } else if (parseInt(jSaveVersion) < this.kMinCompatibleLoadVersion) {
      throw new Error(
        "Ink save format isn't compatible with the current version (saw '" +
          jSaveVersion +
          "', but minimum is " +
          this.kMinCompatibleLoadVersion +
          "), so can't load."
      );
    }

    let flowsObj = jObject["flows"];
    if (flowsObj != null) {
      let flowsObjDict = flowsObj as Record<string, any>;

      // Single default flow
      if (Object.keys(flowsObjDict).length === 1) {
        this._namedFlows = null;
      } else if (this._namedFlows === null) {
        this._namedFlows = new Map();
      } else {
        this._namedFlows.clear();
      }

      let flowsObjDictEntries = Object.entries(flowsObjDict);
      for (let [namedFlowObjKey, namedFlowObjValue] of flowsObjDictEntries) {
        let name = namedFlowObjKey;
        let flowObj = namedFlowObjValue as Record<string, any>;

        let flow = new Flow(name, this.story, flowObj);

        if (Object.keys(flowsObjDict).length === 1) {
          this._currentFlow = new Flow(name, this.story, flowObj);
        } else {
          if (this._namedFlows === null)
            return throwNullException("this._namedFlows");
          this._namedFlows.set(name, flow);
        }
      }

      if (this._namedFlows != null && this._namedFlows.size > 1) {
        let currFlowName = jObject["currentFlowName"] as string;
        // Adding a bang at the end, because we're trusting the save, as
        // done in upstream.  If the save is corrupted, the execution
        // is undefined.
        this._currentFlow = this._namedFlows.get(currFlowName)!;
      }
    } else {
      this._namedFlows = null;
      this._currentFlow.name = this.kDefaultFlowName;
      this._currentFlow.callStack.SetJsonToken(
        jObject["callstackThreads"] as Record<string, any>,
        this.story
      );
      this._currentFlow.outputStream = JsonSerialisation.JArrayToRuntimeObjList(
        jObject["outputStream"] as any[]
      );
      this._currentFlow.currentChoices =
        JsonSerialisation.JArrayToRuntimeObjList(
          jObject["currentChoices"] as any[]
        ) as Choice[];

      let jChoiceThreadsObj = jObject["choiceThreads"];
      this._currentFlow.LoadFlowChoiceThreads(jChoiceThreadsObj, this.story);
    }

    this.OutputStreamDirty();
    this._aliveFlowNamesDirty = true;

    this.variablesState.SetJsonToken(jObject["variablesState"]);
    this.variablesState.callStack = this._currentFlow.callStack;

    this._evaluationStack = JsonSerialisation.JArrayToRuntimeObjList(
      jObject["evalStack"]
    );

    let currentDivertTargetPath = jObject["currentDivertTarget"];
    if (currentDivertTargetPath != null) {
      let divertPath = new Path(currentDivertTargetPath.toString());
      this.divertedPointer = this.story.PointerAtPath(divertPath);
    }

    this._visitCounts = JsonSerialisation.JObjectToIntDictionary(
      jObject["visitCounts"]
    );
    this._turnIndices = JsonSerialisation.JObjectToIntDictionary(
      jObject["turnIndices"]
    );
    this.currentTurnIndex = parseInt(jObject["turnIdx"]);
    this.storySeed = parseInt(jObject["storySeed"]);
    this.previousRandom = parseInt(jObject["previousRandom"]);
  }

  public ResetErrors() {
    this._currentErrors = null;
    this._currentWarnings = null;
  }
  public ResetOutput(objs: InkObject[] | null = null) {
    this.outputStream.length = 0;
    if (objs !== null) this.outputStream.push(...objs);
    this.OutputStreamDirty();
  }

  public PushToOutputStream(obj: InkObject | null) {
    // var text = obj as StringValue;
    let text = asOrNull(obj, StringValue);
    if (text !== null) {
      let listText = this.TrySplittingHeadTailWhitespace(text);
      if (listText !== null) {
        for (let textObj of listText) {
          this.PushToOutputStreamIndividual(textObj);
        }
        this.OutputStreamDirty();
        return;
      }
    }

    this.PushToOutputStreamIndividual(obj);
    this.OutputStreamDirty();
  }

  public PopFromOutputStream(count: number) {
    this.outputStream.splice(this.outputStream.length - count, count);
    this.OutputStreamDirty();
  }

  public TrySplittingHeadTailWhitespace(single: StringValue) {
    let str = single.value;
    if (str === null) {
      return throwNullException("single.value");
    }

    let headFirstNewlineIdx = -1;
    let headLastNewlineIdx = -1;
    for (let i = 0; i < str.length; i++) {
      let c = str[i];
      if (c == "\n") {
        if (headFirstNewlineIdx == -1) headFirstNewlineIdx = i;
        headLastNewlineIdx = i;
      } else if (c == " " || c == "\t") continue;
      else break;
    }

    let tailLastNewlineIdx = -1;
    let tailFirstNewlineIdx = -1;
    for (let i = str.length - 1; i >= 0; i--) {
      let c = str[i];
      if (c == "\n") {
        if (tailLastNewlineIdx == -1) tailLastNewlineIdx = i;
        tailFirstNewlineIdx = i;
      } else if (c == " " || c == "\t") continue;
      else break;
    }

    // No splitting to be done?
    if (headFirstNewlineIdx == -1 && tailLastNewlineIdx == -1) return null;

    let listTexts: StringValue[] = [];
    let innerStrStart = 0;
    let innerStrEnd = str.length;

    if (headFirstNewlineIdx != -1) {
      if (headFirstNewlineIdx > 0) {
        let leadingSpaces = new StringValue(
          str.substring(0, headFirstNewlineIdx)
        );
        listTexts.push(leadingSpaces);
      }
      listTexts.push(new StringValue("\n"));
      innerStrStart = headLastNewlineIdx + 1;
    }

    if (tailLastNewlineIdx != -1) {
      innerStrEnd = tailFirstNewlineIdx;
    }

    if (innerStrEnd > innerStrStart) {
      let innerStrText = str.substring(innerStrStart, innerStrEnd);
      listTexts.push(new StringValue(innerStrText));
    }

    if (tailLastNewlineIdx != -1 && tailFirstNewlineIdx > headLastNewlineIdx) {
      listTexts.push(new StringValue("\n"));
      if (tailLastNewlineIdx < str.length - 1) {
        let numSpaces = str.length - tailLastNewlineIdx - 1;
        let trailingSpaces = new StringValue(
          str.substring(
            tailLastNewlineIdx + 1,
            tailLastNewlineIdx + 1 + numSpaces
          )
        );
        listTexts.push(trailingSpaces);
      }
    }

    return listTexts;
  }

  public PushToOutputStreamIndividual(obj: InkObject | null) {
    let glue = asOrNull(obj, Glue);
    let text = asOrNull(obj, StringValue);

    let includeInOutput = true;

    if (glue) {
      this.TrimNewlinesFromOutputStream();
      includeInOutput = true;
    } else if (text) {
      let functionTrimIndex = -1;
      let currEl = this.callStack.currentElement;
      if (currEl.type == PushPopType.Function) {
        functionTrimIndex = currEl.functionStartInOutputStream;
      }

      let glueTrimIndex = -1;
      for (let i = this.outputStream.length - 1; i >= 0; i--) {
        let o = this.outputStream[i];
        let c = o instanceof ControlCommand ? o : null;
        let g = o instanceof Glue ? o : null;

        if (g != null) {
          glueTrimIndex = i;
          break;
        } else if (
          c != null &&
          c.commandType == ControlCommand.CommandType.BeginString
        ) {
          if (i >= functionTrimIndex) {
            functionTrimIndex = -1;
          }
          break;
        }
      }

      let trimIndex = -1;
      if (glueTrimIndex != -1 && functionTrimIndex != -1)
        trimIndex = Math.min(functionTrimIndex, glueTrimIndex);
      else if (glueTrimIndex != -1) trimIndex = glueTrimIndex;
      else trimIndex = functionTrimIndex;

      if (trimIndex != -1) {
        if (text.isNewline) {
          includeInOutput = false;
        } else if (text.isNonWhitespace) {
          if (glueTrimIndex > -1) this.RemoveExistingGlue();

          if (functionTrimIndex > -1) {
            let callStackElements = this.callStack.elements;
            for (let i = callStackElements.length - 1; i >= 0; i--) {
              let el = callStackElements[i];
              if (el.type == PushPopType.Function) {
                el.functionStartInOutputStream = -1;
              } else {
                break;
              }
            }
          }
        }
      } else if (text.isNewline) {
        if (this.outputStreamEndsInNewline || !this.outputStreamContainsContent)
          includeInOutput = false;
      }
    }

    if (includeInOutput) {
      if (obj === null) {
        return throwNullException("obj");
      }
      this.outputStream.push(obj);
      this.OutputStreamDirty();
    }
  }

  public TrimNewlinesFromOutputStream() {
    let removeWhitespaceFrom = -1;

    let i = this.outputStream.length - 1;
    while (i >= 0) {
      let obj = this.outputStream[i];
      let cmd = asOrNull(obj, ControlCommand);
      let txt = asOrNull(obj, StringValue);

      if (cmd != null || (txt != null && txt.isNonWhitespace)) {
        break;
      } else if (txt != null && txt.isNewline) {
        removeWhitespaceFrom = i;
      }
      i--;
    }

    // Remove the whitespace
    if (removeWhitespaceFrom >= 0) {
      i = removeWhitespaceFrom;
      while (i < this.outputStream.length) {
        let text = asOrNull(this.outputStream[i], StringValue);
        if (text) {
          this.outputStream.splice(i, 1);
        } else {
          i++;
        }
      }
    }

    this.OutputStreamDirty();
  }

  public RemoveExistingGlue() {
    for (let i = this.outputStream.length - 1; i >= 0; i--) {
      let c = this.outputStream[i];
      if (c instanceof Glue) {
        this.outputStream.splice(i, 1);
      } else if (c instanceof ControlCommand) {
        break;
      }
    }

    this.OutputStreamDirty();
  }

  get outputStreamEndsInNewline() {
    if (this.outputStream.length > 0) {
      for (let i = this.outputStream.length - 1; i >= 0; i--) {
        let obj = this.outputStream[i];
        if (obj instanceof ControlCommand) break;
        let text = this.outputStream[i];
        if (text instanceof StringValue) {
          if (text.isNewline) return true;
          else if (text.isNonWhitespace) break;
        }
      }
    }

    return false;
  }

  get outputStreamContainsContent() {
    for (let content of this.outputStream) {
      if (content instanceof StringValue) return true;
    }
    return false;
  }

  get inStringEvaluation() {
    for (let i = this.outputStream.length - 1; i >= 0; i--) {
      let cmd = asOrNull(this.outputStream[i], ControlCommand);
      if (
        cmd instanceof ControlCommand &&
        cmd.commandType == ControlCommand.CommandType.BeginString
      ) {
        return true;
      }
    }

    return false;
  }

  public PushEvaluationStack(obj: InkObject | null) {
    // var listValue = obj as ListValue;
    let listValue = asOrNull(obj, ListValue);
    if (listValue) {
      // Update origin when list is has something to indicate the list origin
      let rawList = listValue.value;
      if (rawList === null) {
        return throwNullException("rawList");
      }

      if (rawList.originNames != null) {
        if (!rawList.origins) rawList.origins = [];
        rawList.origins.length = 0;

        for (let n of rawList.originNames) {
          if (this.story.listDefinitions === null)
            return throwNullException("StoryState.story.listDefinitions");
          let def = this.story.listDefinitions.TryListGetDefinition(n, null);
          if (def.result === null)
            return throwNullException("StoryState def.result");
          if (rawList.origins.indexOf(def.result) < 0)
            rawList.origins.push(def.result);
        }
      }
    }

    if (obj === null) {
      return throwNullException("obj");
    }
    this.evaluationStack.push(obj);
  }

  public PopEvaluationStack(): InkObject;
  public PopEvaluationStack(numberOfObjects: number): InkObject[];
  public PopEvaluationStack(numberOfObjects?: number) {
    if (typeof numberOfObjects === "undefined") {
      let obj = this.evaluationStack.pop();
      return nullIfUndefined(obj);
    } else {
      if (numberOfObjects > this.evaluationStack.length) {
        throw new Error("trying to pop too many objects");
      }

      let popped = this.evaluationStack.splice(
        this.evaluationStack.length - numberOfObjects,
        numberOfObjects
      );
      return nullIfUndefined(popped);
    }
  }

  public PeekEvaluationStack() {
    return this.evaluationStack[this.evaluationStack.length - 1];
  }

  public ForceEnd() {
    this.callStack.Reset();

    this._currentFlow.currentChoices.length = 0;

    this.currentPointer = Pointer.Null;
    this.previousPointer = Pointer.Null;

    this.didSafeExit = true;
  }

  public TrimWhitespaceFromFunctionEnd() {
    Debug.Assert(this.callStack.currentElement.type == PushPopType.Function);
    let functionStartPoint =
      this.callStack.currentElement.functionStartInOutputStream;

    if (functionStartPoint == -1) {
      functionStartPoint = 0;
    }

    for (let i = this.outputStream.length - 1; i >= functionStartPoint; i--) {
      let obj = this.outputStream[i];
      let txt = asOrNull(obj, StringValue);
      let cmd = asOrNull(obj, ControlCommand);

      if (txt == null) continue;
      if (cmd) break;

      if (txt.isNewline || txt.isInlineWhitespace) {
        this.outputStream.splice(i, 1);
        this.OutputStreamDirty();
      } else {
        break;
      }
    }
  }

  public PopCallStack(popType: PushPopType | null = null) {
    if (this.callStack.currentElement.type == PushPopType.Function)
      this.TrimWhitespaceFromFunctionEnd();

    this.callStack.Pop(popType);
  }

  public SetChosenPath(path: Path, incrementingTurnIndex: boolean) {
    // Changing direction, assume we need to clear current set of choices
    this._currentFlow.currentChoices.length = 0;

    let newPointer = this.story.PointerAtPath(path);
    if (!newPointer.isNull && newPointer.index == -1) newPointer.index = 0;

    this.currentPointer = newPointer;

    if (incrementingTurnIndex) {
      this.currentTurnIndex++;
    }
  }

  public StartFunctionEvaluationFromGame(
    funcContainer: Container,
    args: any[]
  ) {
    this.callStack.Push(
      PushPopType.FunctionEvaluationFromGame,
      this.evaluationStack.length
    );
    this.callStack.currentElement.currentPointer =
      Pointer.StartOf(funcContainer);

    this.PassArgumentsToEvaluationStack(args);
  }

  public PassArgumentsToEvaluationStack(args: any[] | null) {
    if (args !== null) {
      for (let i = 0; i < args.length; i++) {
        if (
          !(
            typeof args[i] === "number" ||
            typeof args[i] === "string" ||
            typeof args[i] === "boolean" ||
            args[i] instanceof InkList
          )
        ) {
          throw new Error(
            "ink arguments when calling EvaluateFunction / ChoosePathStringWithParameters must be" +
              "number, string, bool or InkList. Argument was " +
              (nullIfUndefined(args[i]) === null
                ? "null"
                : args[i].constructor.name)
          );
        }

        this.PushEvaluationStack(Value.Create(args[i]));
      }
    }
  }

  public TryExitFunctionEvaluationFromGame() {
    if (
      this.callStack.currentElement.type ==
      PushPopType.FunctionEvaluationFromGame
    ) {
      this.currentPointer = Pointer.Null;
      this.didSafeExit = true;
      return true;
    }

    return false;
  }

  public CompleteFunctionEvaluationFromGame() {
    if (
      this.callStack.currentElement.type !=
      PushPopType.FunctionEvaluationFromGame
    ) {
      throw new Error(
        "Expected external function evaluation to be complete. Stack trace: " +
          this.callStack.callStackTrace
      );
    }

    let originalEvaluationStackHeight =
      this.callStack.currentElement.evaluationStackHeightWhenPushed;

    let returnedObj: InkObject | null = null;
    while (this.evaluationStack.length > originalEvaluationStackHeight) {
      let poppedObj = this.PopEvaluationStack();
      if (returnedObj === null) returnedObj = poppedObj;
    }

    this.PopCallStack(PushPopType.FunctionEvaluationFromGame);

    if (returnedObj) {
      if (returnedObj instanceof Void) return null;

      // Some kind of value, if not void
      // var returnVal = returnedObj as Runtime.Value;
      let returnVal = asOrThrows(returnedObj, Value);

      // DivertTargets get returned as the string of components
      // (rather than a Path, which isn't public)
      if (returnVal.valueType == ValueType.DivertTarget) {
        return "-> " + returnVal.valueObject.toString();
      }

      // Other types can just have their exact object type:
      // int, float, string. VariablePointers get returned as strings.
      return returnVal.valueObject;
    }

    return null;
  }

  public AddError(message: string, isWarning: boolean) {
    if (!isWarning) {
      if (this._currentErrors == null) this._currentErrors = [];
      this._currentErrors.push(message);
    } else {
      if (this._currentWarnings == null) this._currentWarnings = [];
      this._currentWarnings.push(message);
    }
  }

  public OutputStreamDirty() {
    this._outputStreamTextDirty = true;
    this._outputStreamTagsDirty = true;
  }

  private _visitCounts: Map<string, number>;
  private _turnIndices: Map<string, number>;

  private _outputStreamTextDirty = true;
  private _outputStreamTagsDirty = true;

  private _patch: StatePatch | null = null;

  private _currentFlow: Flow;
  private _aliveFlowNames: string[] | null = null;
  private _namedFlows: Map<string, Flow> | null = null;
  private readonly kDefaultFlowName = "DEFAULT_FLOW";
  private _aliveFlowNamesDirty: boolean = true;
}

export class CallStack {
  get elements() {
    return this.callStack;
  }

  get depth() {
    return this.elements.length;
  }

  get currentElement() {
    let thread = this._threads[this._threads.length - 1];
    let cs = thread.callstack;
    return cs[cs.length - 1];
  }

  get currentElementIndex() {
    return this.callStack.length - 1;
  }

  get currentThread(): CallStack.Thread {
    return this._threads[this._threads.length - 1];
  }
  set currentThread(value: CallStack.Thread) {
    Debug.Assert(
      this._threads.length == 1,
      "Shouldn't be directly setting the current thread when we have a stack of them"
    );

    this._threads.length = 0;
    this._threads.push(value);
  }

  get canPop() {
    return this.callStack.length > 1;
  }

  constructor(storyContext: Story);
  constructor(toCopy: CallStack);
  constructor() {
    if (arguments[0] instanceof Story) {
      let storyContext = arguments[0] as Story;

      this._startOfRoot = Pointer.StartOf(storyContext.rootContentContainer);
      this.Reset();
    } else {
      let toCopy = arguments[0] as CallStack;

      this._threads = [];
      for (let otherThread of toCopy._threads) {
        this._threads.push(otherThread.Copy());
      }
      this._threadCounter = toCopy._threadCounter;
      this._startOfRoot = toCopy._startOfRoot.copy();
    }
  }

  public Reset() {
    this._threads = [];
    this._threads.push(new CallStack.Thread());

    this._threads[0].callstack.push(
      new CallStack.Element(PushPopType.Tunnel, this._startOfRoot)
    );
  }

  public SetJsonToken(jObject: Record<string, any>, storyContext: Story) {
    this._threads.length = 0;

    // TODO: (List<object>) jObject ["threads"];
    let jThreads: any[] = jObject["threads"];

    for (let jThreadTok of jThreads) {
      // TODO: var jThreadObj = (Dictionary<string, object>)jThreadTok;
      let jThreadObj = jThreadTok;
      let thread = new CallStack.Thread(jThreadObj, storyContext);
      this._threads.push(thread);
    }

    // TODO: (int)jObject ["threadCounter"];
    this._threadCounter = parseInt(jObject["threadCounter"]);
    this._startOfRoot = Pointer.StartOf(storyContext.rootContentContainer);
  }
  public WriteJson(w: SimpleJson.Writer) {
    w.WriteObject((writer) => {
      writer.WritePropertyStart("threads");
      writer.WriteArrayStart();

      for (let thread of this._threads) {
        thread.WriteJson(writer);
      }

      writer.WriteArrayEnd();
      writer.WritePropertyEnd();

      writer.WritePropertyStart("threadCounter");
      writer.WriteInt(this._threadCounter);
      writer.WritePropertyEnd();
    });
  }

  public PushThread() {
    let newThread = this.currentThread.Copy();
    this._threadCounter++;
    newThread.threadIndex = this._threadCounter;
    this._threads.push(newThread);
  }

  public ForkThread() {
    let forkedThread = this.currentThread.Copy();
    this._threadCounter++;
    forkedThread.threadIndex = this._threadCounter;
    return forkedThread;
  }

  public PopThread() {
    if (this.canPopThread) {
      this._threads.splice(this._threads.indexOf(this.currentThread), 1); // should be equivalent to a pop()
    } else {
      throw new Error("Can't pop thread");
    }
  }

  get canPopThread() {
    return this._threads.length > 1 && !this.elementIsEvaluateFromGame;
  }

  get elementIsEvaluateFromGame() {
    return this.currentElement.type == PushPopType.FunctionEvaluationFromGame;
  }

  public Push(
    type: PushPopType,
    externalEvaluationStackHeight: number = 0,
    outputStreamLengthWithPushed: number = 0
  ) {
    let element = new CallStack.Element(
      type,
      this.currentElement.currentPointer,
      false
    );

    element.evaluationStackHeightWhenPushed = externalEvaluationStackHeight;
    element.functionStartInOutputStream = outputStreamLengthWithPushed;

    this.callStack.push(element);
  }

  public CanPop(type: PushPopType | null = null) {
    if (!this.canPop) return false;

    if (type == null) return true;

    return this.currentElement.type == type;
  }

  public Pop(type: PushPopType | null = null) {
    if (this.CanPop(type)) {
      this.callStack.pop();
      return;
    } else {
      throw new Error("Mismatched push/pop in Callstack");
    }
  }

  public GetTemporaryVariableWithName(
    name: string | null,
    contextIndex: number = -1
  ) {
    // contextIndex 0 means global, so index is actually 1-based
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];

    let varValue = tryGetValueFromMap(
      contextElement.temporaryVariables,
      name,
      null
    );
    if (varValue.exists) {
      return varValue.result;
    } else {
      return null;
    }
  }

  public SetTemporaryVariable(
    name: string,
    value: any,
    declareNew: boolean,
    contextIndex: number = -1
  ) {
    if (contextIndex == -1) contextIndex = this.currentElementIndex + 1;

    let contextElement = this.callStack[contextIndex - 1];

    if (!declareNew && !contextElement.temporaryVariables.get(name)) {
      throw new Error("Could not find temporary variable to set: " + name);
    }

    let oldValue = tryGetValueFromMap(
      contextElement.temporaryVariables,
      name,
      null
    );
    if (oldValue.exists)
      ListValue.RetainListOriginsForAssignment(oldValue.result, value);

    contextElement.temporaryVariables.set(name, value);
  }

  public ContextForVariableNamed(name: string) {
    if (this.currentElement.temporaryVariables.get(name)) {
      return this.currentElementIndex + 1;
    } else {
      return 0;
    }
  }

  public ThreadWithIndex(index: number) {
    let filtered = this._threads.filter((t) => {
      if (t.threadIndex == index) return t;
    });

    return filtered.length > 0 ? filtered[0] : null;
  }

  get callStack() {
    return this.currentThread.callstack;
  }

  get callStackTrace() {
    let sb = new StringBuilder();

    for (let t = 0; t < this._threads.length; t++) {
      let thread = this._threads[t];
      let isCurrent = t == this._threads.length - 1;
      sb.AppendFormat(
        "=== THREAD {0}/{1} {2}===\n",
        t + 1,
        this._threads.length,
        isCurrent ? "(current) " : ""
      );

      for (let i = 0; i < thread.callstack.length; i++) {
        if (thread.callstack[i].type == PushPopType.Function)
          sb.Append("  [FUNCTION] ");
        else sb.Append("  [TUNNEL] ");

        let pointer = thread.callstack[i].currentPointer;
        if (!pointer.isNull) {
          sb.Append("<SOMEWHERE IN ");
          if (pointer.container === null) {
            return throwNullException("pointer.container");
          }
          sb.Append(pointer.container.path.toString());
          sb.AppendLine(">");
        }
      }
    }

    return sb.toString();
  }

  public _threads!: CallStack.Thread[]; // Banged because it's initialized in Reset().
  public _threadCounter: number = 0;
  public _startOfRoot: Pointer = Pointer.Null;
}

export namespace CallStack {
  export class Element {
    public currentPointer: Pointer;
    public inExpressionEvaluation: boolean;
    public temporaryVariables: Map<string, InkObject>;
    public type: PushPopType;

    public evaluationStackHeightWhenPushed: number = 0;
    public functionStartInOutputStream: number = 0;

    constructor(
      type: PushPopType,
      pointer: Pointer,
      inExpressionEvaluation: boolean = false
    ) {
      this.currentPointer = pointer.copy();
      this.inExpressionEvaluation = inExpressionEvaluation;
      this.temporaryVariables = new Map();
      this.type = type;
    }

    public Copy() {
      let copy = new Element(
        this.type,
        this.currentPointer,
        this.inExpressionEvaluation
      );
      copy.temporaryVariables = new Map(this.temporaryVariables);
      copy.evaluationStackHeightWhenPushed =
        this.evaluationStackHeightWhenPushed;
      copy.functionStartInOutputStream = this.functionStartInOutputStream;
      return copy;
    }
  }

  export class Thread {
    public callstack: Element[];
    public threadIndex: number = 0;
    public previousPointer: Pointer = Pointer.Null;

    constructor();
    constructor(jThreadObj: any, storyContext: Story);
    constructor() {
      this.callstack = [];

      if (arguments[0] && arguments[1]) {
        let jThreadObj = arguments[0];
        let storyContext = arguments[1];

        // TODO: (int) jThreadObj['threadIndex'] can raise;
        this.threadIndex = parseInt(jThreadObj["threadIndex"]);

        let jThreadCallstack = jThreadObj["callstack"];

        for (let jElTok of jThreadCallstack) {
          let jElementObj = jElTok;

          // TODO: (int) jElementObj['type'] can raise;
          let pushPopType: PushPopType = parseInt(jElementObj["type"]);

          let pointer = Pointer.Null;

          let currentContainerPathStr: string;
          // TODO: jElementObj.TryGetValue ("cPath", out currentContainerPathStrToken);
          let currentContainerPathStrToken = jElementObj["cPath"];
          if (typeof currentContainerPathStrToken !== "undefined") {
            currentContainerPathStr = currentContainerPathStrToken.toString();

            let threadPointerResult = storyContext.ContentAtPath(
              new Path(currentContainerPathStr)
            );
            pointer.container = threadPointerResult.container;
            pointer.index = parseInt(jElementObj["idx"]);

            if (threadPointerResult.obj == null)
              throw new Error(
                "When loading state, internal story location couldn't be found: " +
                  currentContainerPathStr +
                  ". Has the story changed since this save data was created?"
              );
            else if (threadPointerResult.approximate) {
              if (pointer.container !== null) {
                storyContext.Warning(
                  "When loading state, exact internal story location couldn't be found: '" +
                    currentContainerPathStr +
                    "', so it was approximated to '" +
                    pointer.container.path.toString() +
                    "' to recover. Has the story changed since this save data was created?"
                );
              } else {
                storyContext.Warning(
                  "When loading state, exact internal story location couldn't be found: '" +
                    currentContainerPathStr +
                    "' and it may not be recoverable. Has the story changed since this save data was created?"
                );
              }
            }
          }

          let inExpressionEvaluation = !!jElementObj["exp"];

          let el = new Element(pushPopType, pointer, inExpressionEvaluation);

          let temps = jElementObj["temp"];
          if (typeof temps !== "undefined") {
            el.temporaryVariables =
              JsonSerialisation.JObjectToDictionaryRuntimeObjs(temps);
          } else {
            el.temporaryVariables.clear();
          }

          this.callstack.push(el);
        }

        let prevContentObjPath = jThreadObj["previousContentObject"];
        if (typeof prevContentObjPath !== "undefined") {
          let prevPath = new Path(prevContentObjPath.toString());
          this.previousPointer = storyContext.PointerAtPath(prevPath);
        }
      }
    }

    public Copy() {
      let copy = new Thread();
      copy.threadIndex = this.threadIndex;
      for (let e of this.callstack) {
        copy.callstack.push(e.Copy());
      }
      copy.previousPointer = this.previousPointer.copy();
      return copy;
    }

    public WriteJson(writer: SimpleJson.Writer) {
      writer.WriteObjectStart();

      writer.WritePropertyStart("callstack");
      writer.WriteArrayStart();
      for (let el of this.callstack) {
        writer.WriteObjectStart();
        if (!el.currentPointer.isNull) {
          if (el.currentPointer.container === null) {
            return throwNullException("el.currentPointer.container");
          }
          writer.WriteProperty(
            "cPath",
            el.currentPointer.container.path.componentsString
          );
          writer.WriteIntProperty("idx", el.currentPointer.index);
        }

        writer.WriteProperty("exp", el.inExpressionEvaluation);
        writer.WriteIntProperty("type", el.type);

        if (el.temporaryVariables.size > 0) {
          writer.WritePropertyStart("temp");
          JsonSerialisation.WriteDictionaryRuntimeObjs(
            writer,
            el.temporaryVariables
          );
          writer.WritePropertyEnd();
        }

        writer.WriteObjectEnd();
      }
      writer.WriteArrayEnd();
      writer.WritePropertyEnd();

      writer.WriteIntProperty("threadIndex", this.threadIndex);

      if (!this.previousPointer.isNull) {
        let resolvedPointer = this.previousPointer.Resolve();
        if (resolvedPointer === null) {
          return throwNullException("this.previousPointer.Resolve()");
        }
        writer.WriteProperty(
          "previousContentObject",
          resolvedPointer.path.toString()
        );
      }

      writer.WriteObjectEnd();
    }
  }
}
