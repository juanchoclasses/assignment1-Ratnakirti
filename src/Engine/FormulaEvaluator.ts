import Cell from "./Cell"
import SheetMemory from "./SheetMemory"
import { ErrorMessages } from "./GlobalDefinitions";



export class FormulaEvaluator {
  // Define a function called update that takes a string parameter and returns a number
  private _errorOccured: boolean = false;
  private _errorMessage: string = "";
  private _currentFormula: FormulaType = [];
  private _lastResult: number = 0;
  private _sheetMemory: SheetMemory;
  private _result: number = 0;


  constructor(memory: SheetMemory) {
    this._sheetMemory = memory;
  }

  /**
   * The main method to evaluate a given formula represented as a list of tokens.
   *
   * @param {FormulaType} formula - The formula to evaluate, represented as a list of tokens.
   */
  evaluate(formula: FormulaType) {
    this._result = 0;
    this._errorMessage = "";

    // Handle special cases where the formula is empty or consists of a single token
    if (formula.length === 0) {
      this._errorMessage = ErrorMessages.emptyFormula;
      return;
    }

    /**
    * If the formula has only one token, there are a few possibilities:
    * 1. The token is a number: In this case, the result of the formula is simply this number.
    * 2. The token is a cell reference: The value of the referred cell becomes the result of this formula.
    * 3. The token is neither a number nor a valid cell reference: This means the formula is invalid.
    */
    if (formula.length === 1) {
      // Check if the single token is a number
      if (this.isNumber(formula[0])) {
        this._result = Number(formula[0]);
      }
      // Check if the single token is a cell reference
      else if (this.isCellReference(formula[0])) {
        // Get the value and potential error of the referred cell
        let [value, error] = this.getCellValue(formula[0]);
        // If there's an error in the referred cell, set the error message
        if (error) {
          this._errorMessage = error;
          return;
        }
        // Otherwise, set the result to the value of the referred cell
        this._result = value;
      }
      // If the single token is neither a number nor a valid cell reference
      else {
        this._errorMessage = ErrorMessages.invalidFormula;
      }
      return;
    }

    // Stacks to hold the operands and operators encountered while parsing the formula
    let operandsStack: number[] = [];
    let operatorsStack: string[] = [];

    // Main loop to iterate over each token in the formula and perform the necessary operations
    try {
      for (let i = 0; i < formula.length; i++) {
        let token = formula[i];

        // If the token is a number, push it onto the operands stack
        if (this.isNumber(token)) {
          operandsStack.push(Number(token));
        } else if (this.isCellReference(token)) {
          let [value, error] = this.getCellValue(token);
          if (error) {
            this._errorMessage = error;
            return;
          }
          operandsStack.push(value);
        }
        // If the token is an open parenthesis, push it onto the operators stack
        else if (token === "(") {
          operatorsStack.push(token);
        }
        // If the token is a close parenthesis, pop operators and compute results until an open parenthesis is encountered
        else if (token === ")") {
          while (operatorsStack.length && operatorsStack[operatorsStack.length - 1] !== "(") {
            this.compute(operandsStack, operatorsStack);
          }
          operatorsStack.pop(); // Remove the "("
        }
        // If the token is an operator, pop operators and compute results until an operator with lower precedence is encountered, then push the current operator onto the operators stack
        else {
          while (
            operatorsStack.length &&
            this.precedence(operatorsStack[operatorsStack.length - 1]) >= this.precedence(token)
          ) {
            this.compute(operandsStack, operatorsStack);
          }
          operatorsStack.push(token);
        }
      }

      // After processing all tokens, if there are any remaining operators, pop them and compute the results
      while (operatorsStack.length) {
        if (operatorsStack[operatorsStack.length - 1] === "(") {
          this._errorMessage = ErrorMessages.missingParentheses;
        }
        this.compute(operandsStack, operatorsStack);
      }

      // After processing all tokens, ensure that there is exactly one value left in the stack to be the result
      if (operandsStack.length !== 1) {
        this._errorMessage = ErrorMessages.invalidFormula;
        throw new Error(ErrorMessages.invalidFormula);
      }

      this._result = operandsStack.pop() || 0;
    } catch (error) {
      if (!this._errorMessage) {
        this._errorMessage = ErrorMessages.invalidFormula;
      }
      // If there is exactly one value in the stack, use it as the result, even if there was an error
      if (operandsStack.length === 1) {
        this._result = operandsStack[0];
      }
    }
  }

  /**
   * Determine the precedence of a given operator.
   * Higher number indicates higher precedence.
   *
   * @param {string} op - The operator to get the precedence for.
   * @returns {number} - The precedence of the operator.
   */
  precedence(op: string): number {
    const precedenceMap: { [key: string]: number } = {
      "+": 1,
      "-": 1,
      "*": 2,
      "/": 2
    };
    return precedenceMap[op] || 0;
  }

  /**
   * Calculate the result of applying the given operator to the given operands. 
   * 
   * @param operandsStack
   * @param operatorsStack 
   */
  compute(operandsStack: number[], operatorsStack: string[]) {
    const op = operatorsStack.pop();
    if (operandsStack.length < 2) {
      throw new Error(ErrorMessages.invalidFormula);
    }
    const b = operandsStack.pop() || 0;
    const a = operandsStack.pop() || 0;
    switch (op) {
      case "+":
        operandsStack.push(a + b);
        break;
      case "-":
        operandsStack.push(a - b);
        break;
      case "*":
        operandsStack.push(a * b);
        break;
      case "/":
        if (b === 0) {
          this._errorMessage = ErrorMessages.divideByZero;
          this._result = Infinity;
          throw new Error(ErrorMessages.divideByZero);
        }
        operandsStack.push(a / b);
        break;
      default:
        this._errorMessage = ErrorMessages.invalidOperator;
        throw new Error("Invalid operator");
    }
  }

  public get error(): string {
    return this._errorMessage
  }

  public get result(): number {
    return this._result;
  }




  /**
   * 
   * @param token 
   * @returns true if the toke can be parsed to a number
   */
  isNumber(token: TokenType): boolean {
    return !isNaN(Number(token));
  }

  /**
   * 
   * @param token
   * @returns true if the token is a cell reference
   * 
   */
  isCellReference(token: TokenType): boolean {

    return Cell.isValidCellLabel(token);
  }

  /**
   * 
   * @param token
   * @returns [value, ""] if the cell formula is not empty and has no error
   * @returns [0, error] if the cell has an error
   * @returns [0, ErrorMessages.invalidCell] if the cell formula is empty
   * 
   */
  getCellValue(token: TokenType): [number, string] {
    if (!this._sheetMemory.isValidCellLabel(token)) {
      return [0, ErrorMessages.invalidCell];
    }

    let cell = this._sheetMemory.getCellByLabel(token);
    let formula = cell.getFormula();
    let error = cell.getError();

    // if the cell has an error return 0
    if (error !== "" && error !== ErrorMessages.emptyFormula) {
      return [0, error];
    }

    // if the cell formula is empty return 0
    if (formula.length === 0) {
      return [0, ErrorMessages.invalidCell];
    }


    let value = cell.getValue();
    return [value, ""];

  }


}

export default FormulaEvaluator;